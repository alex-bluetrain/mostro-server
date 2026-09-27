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
                    // Identity only: with ADMIN_EMAIL the key resolves to the real IUser in
                    // Mongo (see callerEmail), so /users/me, admin checks and tools see the
                    // real admin instead of the literal 'admin'.
                    id: appConfig.ADMIN_EMAIL ?? 'admin',
                    email: appConfig.ADMIN_EMAIL,
                    name: appConfig.ADMIN_NAME ?? 'Admin',
                    role: 'admin',
                },
            },
            public: [TELEGRAM_CHANNEL_WEBHOOK],
            // No mapUserToResourceId on purpose: it would scope every request to the
            // admin's email, and Mastra would then hide the household runs (they have
            // no owner) from Studio. Chat routes derive their memory scope themselves
            // in webThreadMiddleware.
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
