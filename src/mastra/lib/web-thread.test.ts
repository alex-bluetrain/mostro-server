import { describe, expect, it, vi } from 'vitest'
import { MASTRA_RESOURCE_ID_KEY, MASTRA_THREAD_ID_KEY } from '@mastra/core/request-context'
import { CLIENT_HEADER, webThreadMiddleware } from './web-thread'

function contextWith(entries: Record<string, unknown>, headers: Record<string, string> = {}) {
    const store = new Map(Object.entries(entries))
    return {
        get: (key: string) => (key === 'requestContext' ? store : undefined),
        req: { header: (name: string) => headers[name] },
        json: vi.fn((body: unknown, status: number) => ({ body, status })),
    } as any
}

describe('webThreadMiddleware', () => {
    it('derives the thread from the resourceId set by auth', async () => {
        const c = contextWith({ [MASTRA_RESOURCE_ID_KEY]: 'ana@gmail.com' })
        const next = vi.fn()

        await webThreadMiddleware(c, next)

        expect(c.get('requestContext').get(MASTRA_THREAD_ID_KEY)).toBe('ana@gmail.com:web')
        expect(next).toHaveBeenCalled()
    })

    // The thread is computed from the token, not the body: sending someone else's identity
    // doesn't change which memory the conversation goes into.
    it('ignores a thread sent by the client', async () => {
        const c = contextWith({
            [MASTRA_RESOURCE_ID_KEY]: 'ana@gmail.com',
            [MASTRA_THREAD_ID_KEY]: 'victima@example.com:web',
        })

        await webThreadMiddleware(c, vi.fn())

        expect(c.get('requestContext').get(MASTRA_THREAD_ID_KEY)).toBe('ana@gmail.com:web')
    })

    it('gives the Android app its own thread', async () => {
        const c = contextWith({ [MASTRA_RESOURCE_ID_KEY]: 'ana@gmail.com' }, { [CLIENT_HEADER]: 'android' })

        await webThreadMiddleware(c, vi.fn())

        expect(c.get('requestContext').get(MASTRA_THREAD_ID_KEY)).toBe('ana@gmail.com:android')
    })

    // The header only picks among the caller's own threads; it can't name another.
    it('falls back to the web thread for an unknown client', async () => {
        const c = contextWith({ [MASTRA_RESOURCE_ID_KEY]: 'ana@gmail.com' }, { [CLIENT_HEADER]: 'telegram' })

        await webThreadMiddleware(c, vi.fn())

        expect(c.get('requestContext').get(MASTRA_THREAD_ID_KEY)).toBe('ana@gmail.com:web')
    })

    it('rejects with 401 without a resourceId', async () => {
        const c = contextWith({})
        const next = vi.fn()

        await webThreadMiddleware(c, next)

        expect(c.json).toHaveBeenCalledWith({ error: 'Unauthorized' }, 401)
        expect(next).not.toHaveBeenCalled()
    })
})
