import { MastraAuthProvider, getRequestHeader } from '@mastra/core/server'
import type { ContextWithMastra, MastraAuthRequest } from '@mastra/core/server'
import { appConfig } from '@config/app.config'
import { assertInvitedAndSyncName } from './invite-gate'
import { TELEGRAM_CHANNEL_WEBHOOK } from './server-auth'
import {
    SESSION_COOKIE,
    SESSION_MAX_AGE_S,
    SESSION_RENEW_BELOW_S,
    cookieHeader,
    readCookie,
    sign,
    verify,
} from './web-session'

// Web session: the browser has no safe place to keep a Google id_token across
// reloads, so after a Google redirect login (auth.route.ts) the server hands it
// a signed HttpOnly cookie instead. This provider accepts that cookie; the
// Bearer id_token path (Android) and the Studio key are untouched.
//
// Our own cookie + our own routes, not @mastra/auth-google's SSO mode: that
// one ties the session to the id_token (~1h) and its /auth/sso/* login counts
// as an EE feature in production.

export type WebSessionConfig = {
    clientId: string
    clientSecret: string
    cookieSecret: string
    authUrl: string
    appUrl: string
    secure: boolean
}

type SessionPayload = { email: string; exp: number }

export function webSessionConfig(): WebSessionConfig | undefined {
    const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_COOKIE_PASSWORD, WEB_AUTH_URL, WEB_APP_URL } = appConfig
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_COOKIE_PASSWORD || !WEB_AUTH_URL || !WEB_APP_URL) {
        return undefined
    }
    return {
        clientId: GOOGLE_CLIENT_ID,
        clientSecret: GOOGLE_CLIENT_SECRET,
        cookieSecret: GOOGLE_COOKIE_PASSWORD,
        authUrl: WEB_AUTH_URL.replace(/\/$/, ''),
        appUrl: WEB_APP_URL,
        secure: WEB_AUTH_URL.startsWith('https://'),
    }
}

export function readSession(cookies: string | null | undefined, config: WebSessionConfig, now = Date.now()) {
    return verify<SessionPayload>(readCookie(cookies, SESSION_COOKIE), config.cookieSecret, now)
}

export function sessionCookie(email: string, config: WebSessionConfig, now = Date.now()): string {
    const exp = Math.floor(now / 1000) + SESSION_MAX_AGE_S
    return cookieHeader(SESSION_COOKIE, sign({ email, exp }, config.cookieSecret), SESSION_MAX_AGE_S, config.secure)
}

export function clearSessionCookie(config: WebSessionConfig): string {
    return cookieHeader(SESSION_COOKIE, '', 0, config.secure)
}

// Sliding renewal: a fresh 30-day cookie once the current one is past half its
// life, so an active user never gets logged out.
export function renewedSessionCookie(cookies: string | null | undefined, config: WebSessionConfig, now = Date.now()) {
    const session = readSession(cookies, config, now)
    if (!session || session.exp * 1000 - now > SESSION_RENEW_BELOW_S * 1000) return undefined
    return sessionCookie(session.email, config, now)
}

// Runs around every request; only touches successful responses to requests
// that carried a session cookie. Logout sets its own (clearing) cookie.
export const sessionRenewalMiddleware = async (c: ContextWithMastra, next: () => Promise<void>) => {
    await next()
    const config = webSessionConfig()
    if (!config || c.res.status >= 400 || c.res.headers.has('Set-Cookie')) return
    const renewed = renewedSessionCookie(c.req.header('cookie'), config)
    if (!renewed) return
    // Rewrap: some responses (e.g. streamed ones) come with immutable headers.
    c.res = new Response(c.res.body, c.res)
    c.res.headers.append('Set-Cookie', renewed)
}

export class WebSessionAuth extends MastraAuthProvider<{ id: string; email: string }> {
    constructor(private readonly config: WebSessionConfig) {
        super({ name: 'web-session', public: [TELEGRAM_CHANNEL_WEBHOOK] })
    }

    async authenticateToken(_token: string, request: MastraAuthRequest) {
        const session = readSession(getRequestHeader(request, 'cookie'), this.config)
        return session ? { id: session.email, email: session.email } : null
    }

    // Re-checked on every request, same as the Bearer path: removing someone
    // from users locks them out without waiting for the cookie to expire.
    async authorizeUser(user: { email?: string }) {
        if (!user?.email) return false
        try {
            await assertInvitedAndSyncName({ email: user.email })
            return true
        } catch {
            return false
        }
    }

    mapUserToResourceId = (user: { email?: string }) => user?.email
}
