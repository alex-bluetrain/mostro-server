import { findChannelUser, defaultChannelUserDeps, type ChannelUserDeps } from './channel-user'

export type ResolveResourceIdDeps = ChannelUserDeps

// Canonical memory: every thread is filed under the user's email, so the
// web and every chat channel share memory. A user who writes via
// Telegram and via Discord lands on the same resourceId.
//
// The gate rejects unknown users before they get here, so a failed lookup
// is a bug or a DB failure: it throws so it's loud instead of creating an
// orphan thread with a non-canonical id.
export function createResolveResourceId(deps: ResolveResourceIdDeps = defaultChannelUserDeps) {
    return async ({
        platform,
        message,
    }: {
        platform: string
        message: { author: { userId: string } }
    }): Promise<string> => {
        const user = await findChannelUser(deps, platform, message.author.userId)
        if (!user) {
            throw new Error(`[resolve-resource-id] no user for ${platform} id ${message.author.userId}`)
        }
        return user.email
    }
}
