import type { RequestContext } from '@mastra/core/request-context'

// Who is calling, as the auth provider verified it. Mastra stores the
// authenticated user under 'user'; both providers expose an `email` (Google from
// the id_token, the Studio key from ADMIN_EMAIL).
//
// This is identity, not data scope: MASTRA_RESOURCE_ID_KEY decides which memory
// and runs a request may read, and the Studio key deliberately leaves it unset
// so the operator sees every run.
export function callerEmail(requestContext: Pick<RequestContext, 'get'> | undefined): string | undefined {
    const user = requestContext?.get('user') as { email?: unknown } | undefined
    const email = typeof user?.email === 'string' ? user.email.trim().toLowerCase() : ''
    return email.includes('@') ? email : undefined
}

// The caller's email for a tool: the conversation's owner when there is one
// (web, Telegram, Discord), otherwise whoever authenticated the request (Studio
// agent chat, which carries no resourceId).
//
// TODO: replace the '@' heuristic with a single resolveRequestUser(requestContext)
// that each entry point (web auth, channel gate) feeds with the user it already found.
export function toolCallerEmail(
    context: { agent?: { resourceId?: string }; requestContext?: Pick<RequestContext, 'get'> } | undefined
): string | undefined {
    // Studio chat sends the agent id as resourceId, which is not a person.
    const owner = context?.agent?.resourceId
    return owner?.includes('@') ? owner : callerEmail(context?.requestContext)
}
