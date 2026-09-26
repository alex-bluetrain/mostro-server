import type { Message, RunAgentInput } from '@ag-ui/core'
import { MastraAgent } from '@ag-ui/mastra'
import { MASTRA_RESOURCE_ID_KEY, MASTRA_THREAD_ID_KEY } from '@mastra/core/request-context'
import { registerApiRoute } from '@mastra/core/server'
import { mostroAgent } from '../agents/mostro-agent'
import { webThreadMiddleware } from '@lib/web-thread'

// AG-UI entry point for the web client: `@ag-ui/mastra` translates the
// Mostro agent stream into AG-UI protocol events, which OpenUI parses with
// agUIAdapter() in the browser. There is no `streamHandler`: the API is `run()`,
// which returns an Observable, and each event is serialized as SSE.
//
// The MastraAgent is created per request, not at module level: it carries the
// requestContext (source of CHANNEL_KEY, which makes the agent answer in
// openui-lang) and the traceId, which would be shared across users if the
// instance were a singleton.
export const agUIRoute = registerApiRoute('/agents/mostro-supervisor/openui', {
    method: 'POST',
    // Same middleware as /chat: global auth (Google id_token or STUDIO_API_KEY) already set the resourceId; here it is required and the thread is derived from it.
    middleware: webThreadMiddleware,
    handler: async c => {
        const requestContext = c.get('requestContext')
        const resourceId = requestContext.get(MASTRA_RESOURCE_ID_KEY) as string
        const threadId = requestContext.get(MASTRA_THREAD_ID_KEY) as string

        const { messages, state } = await c.req.json<{ messages: Message[]; state?: RunAgentInput['state'] }>()

        const agent = new MastraAgent({ agent: mostroAgent, resourceId, requestContext })
        const encoder = new TextEncoder()

        const stream = new ReadableStream({
            start(controller) {
                const subscription = agent
                    .run({ messages, state, threadId, runId: crypto.randomUUID(), tools: [], context: [] })
                    .subscribe({
                        next: event => {
                            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
                        },
                        complete: () => {
                            controller.enqueue(encoder.encode('data: [DONE]\n\n'))
                            controller.close()
                        },
                        error: (error: Error) => {
                            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: error.message })}\n\n`))
                            controller.close()
                        },
                    })

                c.req.raw.signal.addEventListener('abort', () => subscription.unsubscribe())
            },
        })

        return new Response(stream, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache, no-transform',
                Connection: 'keep-alive',
            },
        })
    },
})
