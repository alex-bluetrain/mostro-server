import { MASTRA_RESOURCE_ID_KEY, MASTRA_THREAD_ID_KEY } from '@mastra/core/request-context'
import type { Middleware } from '@mastra/core/server'
import { channelThreadId, type ThreadChannel } from './channel-thread-id'
import { callerEmail } from './request-identity'

// `Middleware` is the union of the handler and its `path` form; routes only
// accept the bare handler.
type MiddlewareHandler = Extract<Middleware, { handler: unknown }>['handler']

// Channel marker for the agent's dynamic prompt. We set it here, at the
// only door the browser comes through: if there's ever another channel, it doesn't
// inherit OpenUI by accident —it has to ask for it explicitly.
export const CHANNEL_KEY = 'mostro.channel'

// The web and Android apps share this door but keep their own thread: with no
// sync between them, one thread would interleave two open conversations.
// Every client must name itself; iOS will get its own `ios` value when it ships.
export const CLIENT_HEADER = 'X-Mostro-Client'
const CLIENT_CHANNELS = ['web', 'android'] as const satisfies readonly ThreadChannel[]

function clientThreadChannel(client: string | undefined): ThreadChannel | undefined {
    return CLIENT_CHANNELS.find((channel) => channel === client)
}

export const webThreadMiddleware: MiddlewareHandler = async (c, next) => {
    const requestContext = c.get('requestContext')
    // Google auth already scopes the request to the email; the Studio key doesn't
    // (so Studio sees every run), so chat scopes its memory to the caller here.
    const resourceId = requestContext?.get(MASTRA_RESOURCE_ID_KEY) || callerEmail(requestContext)

    if (typeof resourceId !== 'string' || !resourceId) {
        return c.json({ error: 'Unauthorized' }, 401)
    }

    const channel = clientThreadChannel(c.req.header(CLIENT_HEADER))
    if (!channel) {
        return c.json({ error: `${CLIENT_HEADER} must be one of: ${CLIENT_CHANNELS.join(', ')}` }, 400)
    }

    requestContext.set(MASTRA_RESOURCE_ID_KEY, resourceId)
    requestContext.set(MASTRA_THREAD_ID_KEY, channelThreadId(resourceId, channel))
    requestContext.set(CHANNEL_KEY, 'web')
    await next()
}
