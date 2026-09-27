import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@lib/request-identity', () => ({
    resolveRequestUser: vi.fn(),
}))
vi.mock('@business/repositories/user.repository', () => ({
    userRepository: { updatePreferences: vi.fn() },
}))

import { meRoute, updateMyPreferencesRoute } from './me.route'
import { resolveRequestUser } from '@lib/request-identity'
import { userRepository } from '@business/repositories/user.repository'

// The handler only uses `get('requestContext')` and `json()`, so the Hono context
// can be faked with those two things and the test doesn't start a server.
function run(resourceId?: string): Promise<{ body: unknown; status?: number }> {
    const c = {
        get: (key: string) =>
            key === 'requestContext'
                ? { get: (k: string) => (k === 'user' && resourceId ? { email: resourceId } : undefined) }
                : undefined,
        json: (body: unknown, status?: number) => ({ body, status }),
    }
    const handler = (meRoute as { handler: (c: unknown) => Promise<{ body: unknown; status?: number }> }).handler
    return handler(c)
}

describe('meRoute', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('returns the caller identity, role and preferences', async () => {
        vi.mocked(resolveRequestUser).mockResolvedValue({
            email: 'ana@gmail.com',
            name: 'Ana',
            role: 'admin',
            addedAt: 1,
            preferences: { notifications: true },
        } as any)

        const response = await run('ana@gmail.com')

        expect(response.body).toEqual({
            email: 'ana@gmail.com',
            name: 'Ana',
            role: 'admin',
            preferences: { notifications: true, language: null, theme: null },
        })
    })

    it('defaults notifications to false for users predating the preferences field', async () => {
        vi.mocked(resolveRequestUser).mockResolvedValue({
            email: 'ana@gmail.com',
            name: 'Ana',
            role: 'member',
            addedAt: 1,
        } as any)

        const response = await run('ana@gmail.com')

        expect(response.body).toMatchObject({ preferences: { notifications: false } })
    })

    it('401s when the caller cannot be resolved', async () => {
        vi.mocked(resolveRequestUser).mockResolvedValue(null)

        const response = await run('ghost@gmail.com')

        expect(response.status).toBe(401)
    })
})

type Handler = (c: unknown) => Promise<{ body: unknown; status?: number }>

function patch(body: unknown): Promise<{ body: unknown; status?: number }> {
    const c = {
        get: (key: string) => (key === 'requestContext' ? {} : undefined),
        req: { json: async () => body },
        json: (b: unknown, status?: number) => ({ body: b, status }),
    }
    return (updateMyPreferencesRoute as { handler: Handler }).handler(c)
}

describe('updateMyPreferencesRoute', () => {
    const ana = { email: 'ana@gmail.com', name: 'Ana', role: 'member', addedAt: 1, preferences: { notifications: false } }

    beforeEach(() => {
        vi.clearAllMocks()
        vi.mocked(resolveRequestUser).mockResolvedValue(ana as any)
    })

    it('saves only the fields sent and returns the updated user', async () => {
        vi.mocked(userRepository.updatePreferences).mockResolvedValue({
            ...ana,
            preferences: { notifications: false, theme: 'dark' },
        } as any)

        const response = await patch({ theme: 'dark' })

        expect(userRepository.updatePreferences).toHaveBeenCalledWith('ana@gmail.com', { theme: 'dark' })
        expect(response.body).toMatchObject({ preferences: { theme: 'dark', language: null } })
    })

    it.each([{ theme: 'blue' }, { language: 'fr' }, { notifications: 'yes' }, {}, null])(
        'rejects %j with 400',
        async body => {
            const response = await patch(body)

            expect(response.status).toBe(400)
            expect(userRepository.updatePreferences).not.toHaveBeenCalled()
        },
    )

    it('401s when the caller cannot be resolved', async () => {
        vi.mocked(resolveRequestUser).mockResolvedValue(null)

        expect((await patch({ theme: 'dark' })).status).toBe(401)
    })
})
