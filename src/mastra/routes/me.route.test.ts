import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@lib/request-identity', () => ({
    resolveRequestUser: vi.fn(),
}))

import { meRoute } from './me.route'
import { resolveRequestUser } from '@lib/request-identity'

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
            preferences: { notifications: true },
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
