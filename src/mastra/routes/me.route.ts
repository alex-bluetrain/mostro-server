import { registerApiRoute } from '@mastra/core/server'
import { resolveRequestUser } from '@lib/request-identity'
import { LANGUAGES, THEMES, type IUser, type IUserPreferences } from '@business/models/user.model'
import { userRepository } from '@business/repositories/user.repository'

function toResponse(user: IUser) {
    return {
        email: user.email,
        name: user.name,
        role: user.role,
        preferences: {
            notifications: user.preferences?.notifications ?? false,
            language: user.preferences?.language ?? null,
            theme: user.preferences?.theme ?? null,
        },
    }
}

// Who am I, according to Mostro. mostro-app has no way to know a user's role
// (its only identity is the email Google verified), so it asks here and stores
// it in the session.
//
// No need to check the invitation: the auth provider already rejected anyone not
// in users before reaching the handler. The user comes from the identity the
// credentials resolved, never from the body or the query.
export const meRoute = registerApiRoute('/users/me', {
    method: 'GET',
    handler: async c => {
        const user = await resolveRequestUser(c.get('requestContext'))
        if (!user) {
            return c.json({ error: 'Unauthorized' }, 401)
        }

        return c.json(toResponse(user))
    },
})

// Partial update: only the fields present in the body change.
export const updateMyPreferencesRoute = registerApiRoute('/users/me/preferences', {
    method: 'PATCH',
    handler: async c => {
        const user = await resolveRequestUser(c.get('requestContext'))
        if (!user) {
            return c.json({ error: 'Unauthorized' }, 401)
        }

        const body = await c.req.json().catch(() => null)
        const changes: Partial<IUserPreferences> = {}
        if (body?.notifications !== undefined) {
            if (typeof body.notifications !== 'boolean') return c.json({ error: 'Invalid notifications' }, 400)
            changes.notifications = body.notifications
        }
        if (body?.language !== undefined) {
            if (!LANGUAGES.includes(body.language)) return c.json({ error: 'Invalid language' }, 400)
            changes.language = body.language
        }
        if (body?.theme !== undefined) {
            if (!THEMES.includes(body.theme)) return c.json({ error: 'Invalid theme' }, 400)
            changes.theme = body.theme
        }
        if (Object.keys(changes).length === 0) {
            return c.json({ error: 'No preferences to update' }, 400)
        }

        const updated = await userRepository.updatePreferences(user.email, changes)
        if (!updated) return c.json({ error: 'Unauthorized' }, 401)

        return c.json(toResponse(updated))
    },
})
