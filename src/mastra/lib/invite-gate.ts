import { userRepository } from '@business/repositories'
import { appLogger } from './app-logger';

export type InviteGateDeps = {
    findByEmail: (email: string) => Promise<{ name: string } | null>
    setUserName: (email: string, name: string) => Promise<boolean>
}

const defaultDeps: InviteGateDeps = {
    findByEmail: email => userRepository.findByEmail(email),
    setUserName: (email, name) => userRepository.setUserName(email, name),
}

// Invite-only access: identity is verified by whoever issues the token (Google,
// against its JWKS), but belonging to the app means existing in users. It also
// fills in the name from the profile the first time; it never overwrites a name
// already chosen (e.g. via set-my-name-tool).
export async function assertInvitedAndSyncName(
    user: { email?: string; emailVerified?: boolean; name?: string },
    deps: InviteGateDeps = defaultDeps,
): Promise<void> {
    if (!user.email || user.emailVerified === false) {
        throw new Error('google account has no verified email')
    }
    const known = await deps.findByEmail(user.email)
    if (!known) {
        throw new Error(`no user for ${user.email}: access is invite-only`)
    }
    if (!known.name && user.name) {
        try {
            await deps.setUserName(user.email, user.name)
        } catch (err) {
            // Cosmetic: never block an invitee's login because we couldn't
            // sync the name from the Google profile.
            appLogger.warn('[invite-gate] failed to sync name from google profile', { err })
        }
    }
}
