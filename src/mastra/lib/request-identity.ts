import type { RequestContext } from '@mastra/core/request-context'
import { userRepository } from '@business/repositories'
import type { IUser } from '@business'

export type RequestIdentityDeps = {
    getUserByEmail: (email: string) => Promise<IUser | null>
}

export const defaultRequestIdentityDeps: RequestIdentityDeps = {
    getUserByEmail: email => userRepository.findByEmail(email),
}

// Key where a channel entry point records the user it already verified.
export const CALLER_KEY = 'mostro.caller'

// Who is calling. Recorded where the credentials are checked, never inferred
// later:
// - HTTP (Google id_token, web session cookie, Studio key): Mastra's auth step
//   stores the verified user under 'user'; its email is the identity.
// - Chat channels (Telegram, Discord): the channel gate already found the user
//   and stamps it under CALLER_KEY.
//
// Deliberately NOT MASTRA_RESOURCE_ID_KEY: that is whose memory the thread
// belongs to, a different question (Studio chat, for one, sets it to the agent id).
export function callerEmail(requestContext: Pick<RequestContext, 'get'> | undefined): string | undefined {
    const user = requestContext?.get('user') as { email?: unknown } | undefined
    const email = typeof user?.email === 'string' ? user.email.trim().toLowerCase() : ''
    return email || undefined
}

// Cached per RequestContext: the ToolSearchProcessor filter runs for every
// candidate tool, plus the skills resolver and the tools themselves.
const cache = new WeakMap<object, Promise<IUser | null>>()

export function resolveRequestUser(
    requestContext: Pick<RequestContext, 'get'> | undefined,
    deps: RequestIdentityDeps = defaultRequestIdentityDeps
): Promise<IUser | null> {
    if (!requestContext) return Promise.resolve(null)

    const cached = cache.get(requestContext)
    if (cached) return cached

    const promise = lookup(requestContext, deps)
    cache.set(requestContext, promise)
    return promise
}

async function lookup(requestContext: Pick<RequestContext, 'get'>, deps: RequestIdentityDeps): Promise<IUser | null> {
    const stamped = requestContext.get(CALLER_KEY) as IUser | undefined
    if (stamped) return stamped

    const email = callerEmail(requestContext)
    return email ? deps.getUserByEmail(email) : null
}

export async function isRequestAdmin(
    requestContext: Pick<RequestContext, 'get'> | undefined,
    deps: RequestIdentityDeps = defaultRequestIdentityDeps
): Promise<boolean> {
    const user = await resolveRequestUser(requestContext, deps)
    return user?.role === 'admin'
}
