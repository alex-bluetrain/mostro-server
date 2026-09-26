import { SimpleAuth, CompositeAuth } from '@mastra/core/server'
import { appConfig } from '@config/app.config'
import { createGoogleAuth } from './google-auth'
import { appLogger } from './app-logger'

// The Telegram channel webhook lives under /api/* (protected by default by the
// auth middleware) but already has its own protection via
// TELEGRAM_WEBHOOK_SECRET_TOKEN, so it must stay public or the bot dies.
export const TELEGRAM_CHANNEL_WEBHOOK = /^\/api\/agents\/[^/]+\/channels\/telegram\/webhook$/

// Two ways in, both via bearer token and neither gated by the EE
// license (the gate only covers login UI: SSO and credentials, which we don't use):
// - Google id_token directly → PKCE clients (Expo), verified against JWKS.
// - SimpleAuth with STUDIO_API_KEY → Studio, a single admin token.
//
// CompositeAuth tries the providers in order and the first to authenticate wins;
// it merges every provider's `public`, so the Telegram webhook stays open.
//
// If you add entries to SimpleAuth, keep in mind authorizeUser() accepts
// any token in the map for everything: there are no per-route or per-role permissions, and the
// map is frozen at boot (adding/removing a user means restarting).
export function createServerAuth() {
    const googleAuth = createGoogleAuth()

    const studioAuth = appConfig.STUDIO_API_KEY
        ? new SimpleAuth({
            tokens: {
                [appConfig.STUDIO_API_KEY]: {
                    // The id IS the resourceId (see mapUserToResourceId below). When
                    // ADMIN_EMAIL is set, we use it so the token resolves to the real IUser
                    // in Mongo (resolveRequestUser only looks up ids containing '@'):
                    // that way /users/me responds and isRequestAdmin sees the real role, instead
                    // of the literal 'admin' which matches no business user.
                    id: appConfig.ADMIN_EMAIL ?? 'admin',
                    name: appConfig.ADMIN_NAME ?? 'Admin',
                    role: 'admin',
                },
            },
            public: [TELEGRAM_CHANNEL_WEBHOOK],
            // Without this, SimpleAuth authenticates but doesn't populate MASTRA_RESOURCE_ID_KEY,
            // and webThreadMiddleware rejects with 401. The resource id pins the admin's
            // memory (with ADMIN_EMAIL, it shares thread/memory with the same user
            // logged in via Google; without it, a separate 'admin' thread).
            mapUserToResourceId: user => user.id,
        })
        : undefined

    const providers = [googleAuth, studioAuth].filter(p => p !== undefined)

    if (providers.length === 0) {
        // With no providers the server is left open, so it's a config error
        // that should hurt at boot, not on the first request.
        throw new Error('[server-auth] no auth provider configured: set GOOGLE_CLIENT_ID and/or STUDIO_API_KEY')
    }

    if (providers.length === 1) return providers[0]

    appLogger.info(`[server-auth] auth enabled: ${providers.length} providers`)
    return new CompositeAuth(providers)
}
