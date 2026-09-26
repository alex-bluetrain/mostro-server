import { MASTRA_RESOURCE_ID_KEY, MASTRA_THREAD_ID_KEY } from '@mastra/core/request-context'
import type { Middleware } from '@mastra/core/server'
import { channelThreadId } from './channel-thread-id'

// `Middleware` is the union of the handler and its `path` form; routes only
// accept the bare handler.
type MiddlewareHandler = Extract<Middleware, { handler: unknown }>['handler']

// Channel marker for the supervisor's dynamic prompt. We set it here, at the
// only door the browser comes through: if there's ever another channel, it doesn't
// inherit OpenUI by accident —it has to ask for it explicitly.
export const CHANNEL_KEY = 'mostro.channel'

export const webThreadMiddleware: MiddlewareHandler = async (c, next) => {
    const requestContext = c.get('requestContext')
    const resourceId = requestContext?.get(MASTRA_RESOURCE_ID_KEY)

    if (typeof resourceId !== 'string' || !resourceId) {
        return c.json({ error: 'Unauthorized' }, 401)
    }

    requestContext.set(MASTRA_THREAD_ID_KEY, channelThreadId(resourceId, 'web'))
    requestContext.set(CHANNEL_KEY, 'web')
    await next()
}
