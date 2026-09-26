import { describe, expect, it, vi, beforeEach } from 'vitest'

const runMock = vi.fn()
const constructorMock = vi.fn()

vi.mock('@ag-ui/mastra', () => ({
    MastraAgent: class {
        constructor(config: unknown) {
            constructorMock(config)
        }
        run = runMock
    },
}))

import { agUIRoute } from './ag-ui.route'
import { MASTRA_RESOURCE_ID_KEY, MASTRA_THREAD_ID_KEY } from '@mastra/core/request-context'

type Handler = (c: unknown) => Promise<Response>

function contextWith(body: unknown) {
    const store = new Map<string, unknown>([
        [MASTRA_RESOURCE_ID_KEY, 'ana@gmail.com'],
        [MASTRA_THREAD_ID_KEY, 'ana@gmail.com:web'],
    ])
    return {
        get: (key: string) => (key === 'requestContext' ? store : undefined),
        req: {
            json: async () => body,
            raw: { signal: new AbortController().signal },
        },
    }
}

async function readSse(response: Response): Promise<string> {
    return await new Response(response.body).text()
}

describe('agUIRoute', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        runMock.mockReturnValue({
            subscribe: ({ next, complete }: { next: (e: unknown) => void; complete: () => void }) => {
                next({ type: 'RUN_STARTED' })
                complete()
                return { unsubscribe: vi.fn() }
            },
        })
    })

    it('is behind the middleware that requires an authenticated identity and marks the web channel', () => {
        expect((agUIRoute as unknown as { middleware: unknown }).middleware).toBeDefined()
    })

    // Without requestContext the agent does not see CHANNEL_KEY and answers
    // in plain text, which the OpenUI client cannot render.
    it('passes the requestContext and resourceId to the AG-UI bridge', async () => {
        const handler = (agUIRoute as unknown as { handler: Handler }).handler
        await handler(contextWith({ messages: [] }))

        expect(constructorMock).toHaveBeenCalledWith(
            expect.objectContaining({ resourceId: 'ana@gmail.com', requestContext: expect.anything() })
        )
    })

    // The thread comes from the token (derived by webThreadMiddleware), never from the body.
    it('uses the thread from the context, not the one the client sends', async () => {
        const handler = (agUIRoute as unknown as { handler: Handler }).handler
        await handler(contextWith({ messages: [], threadId: 'victima@example.com:web' }))

        expect(runMock).toHaveBeenCalledWith(expect.objectContaining({ threadId: 'ana@gmail.com:web' }))
    })

    it('serializes the Observable events as SSE', async () => {
        const handler = (agUIRoute as unknown as { handler: Handler }).handler
        const response = await handler(contextWith({ messages: [] }))

        expect(response.headers.get('Content-Type')).toBe('text/event-stream')
        expect(await readSse(response)).toBe('data: {"type":"RUN_STARTED"}\n\ndata: [DONE]\n\n')
    })
})
