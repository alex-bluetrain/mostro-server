import { randomBytes } from 'node:crypto'
import { registerApiRoute } from '@mastra/core/server'
import type { ContextWithMastra } from '@mastra/core/server'
import { assertInvitedAndSyncName } from '@lib/invite-gate'
import { appLogger } from '@lib/app-logger'
import { cookieHeader, readCookie, sign, verify } from '@lib/web-session'
import { clearSessionCookie, sessionCookie, webSessionConfig, type WebSessionConfig } from '@lib/web-session-auth'

// Google redirect login for the web app (see web-session-auth.ts). The browser
// goes to /auth/google/login, Google sends it back to /auth/google/callback
// with a code, we trade the code for an id_token (server to server, with the
// client secret) and answer with the session cookie.

const STATE_COOKIE = 'mostro_oauth_state'
const STATE_MAX_AGE_S = 10 * 60

function redirectUri(config: WebSessionConfig) {
    return `${config.authUrl}/auth/google/callback`
}

function backToApp(c: ContextWithMastra, config: WebSessionConfig, cookies: string[], error?: string) {
    const url = new URL(config.appUrl)
    if (error) url.searchParams.set('login_error', error)
    for (const cookie of cookies) c.header('Set-Cookie', cookie, { append: true })
    return c.redirect(url.toString(), 302)
}

export const googleLoginRoute = registerApiRoute('/auth/google/login', {
    method: 'GET',
    requiresAuth: false,
    handler: async c => {
        const config = webSessionConfig()
        if (!config) return c.json({ error: 'Web login disabled' }, 404)

        const state = randomBytes(16).toString('base64url')
        const exp = Math.floor(Date.now() / 1000) + STATE_MAX_AGE_S
        c.header('Set-Cookie', cookieHeader(STATE_COOKIE, sign({ state, exp }, config.cookieSecret), STATE_MAX_AGE_S, config.secure))

        const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
        url.search = new URLSearchParams({
            client_id: config.clientId,
            redirect_uri: redirectUri(config),
            response_type: 'code',
            scope: 'openid email profile',
            state,
            prompt: 'select_account',
        }).toString()
        return c.redirect(url.toString(), 302)
    },
})

export const googleCallbackRoute = registerApiRoute('/auth/google/callback', {
    method: 'GET',
    requiresAuth: false,
    handler: async c => {
        const config = webSessionConfig()
        if (!config) return c.json({ error: 'Web login disabled' }, 404)

        const clearState = cookieHeader(STATE_COOKIE, '', 0, config.secure)
        const saved = verify<{ state: string; exp: number }>(readCookie(c.req.header('cookie'), STATE_COOKIE), config.cookieSecret)
        const code = c.req.query('code')
        if (!saved || !code || c.req.query('state') !== saved.state) {
            return backToApp(c, config, [clearState], 'invalid_state')
        }

        const profile = await exchangeCode(code, config)
        if (!profile) return backToApp(c, config, [clearState], 'google')

        try {
            await assertInvitedAndSyncName(profile)
        } catch {
            return backToApp(c, config, [clearState], 'not_invited')
        }
        return backToApp(c, config, [clearState, sessionCookie(profile.email, config)])
    },
})

export const logoutRoute = registerApiRoute('/auth/logout', {
    method: 'POST',
    requiresAuth: false,
    handler: async c => {
        const config = webSessionConfig()
        if (!config) return c.json({ error: 'Web login disabled' }, 404)
        c.header('Set-Cookie', clearSessionCookie(config))
        return c.body(null, 204)
    },
})

// The id_token comes straight from Google's token endpoint over TLS in answer
// to our client secret, so per OIDC we can read its claims without checking
// the signature; aud and email_verified are still checked.
async function exchangeCode(code: string, config: WebSessionConfig) {
    try {
        const res = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                code,
                client_id: config.clientId,
                client_secret: config.clientSecret,
                redirect_uri: redirectUri(config),
                grant_type: 'authorization_code',
            }),
        })
        if (!res.ok) {
            appLogger.warn('[auth] google token exchange failed', { status: res.status })
            return undefined
        }
        const { id_token } = (await res.json()) as { id_token?: string }
        const claims = JSON.parse(Buffer.from(id_token?.split('.')[1] ?? '', 'base64url').toString()) as {
            aud?: string
            email?: string
            email_verified?: boolean
            name?: string
        }
        if (claims.aud !== config.clientId || typeof claims.email !== 'string') return undefined
        return { email: claims.email.toLowerCase(), emailVerified: claims.email_verified, name: claims.name }
    } catch (err) {
        appLogger.warn('[auth] google token exchange failed', { err })
        return undefined
    }
}
