import type { RequestContext } from '@mastra/core/request-context'
import type { IUser } from '@business/models/user.model'
import { resolveRequestUser } from './request-identity'

// The auth provider guarantees the caller is an invited user, but not that they
// are an admin: that is decided here, with the real user, not with whatever the
// client claims. mostro-app uses the role to hide screens; this is the gate.
export async function requireAdmin(requestContext: Pick<RequestContext, 'get'> | undefined): Promise<IUser | null> {
    const user = await resolveRequestUser(requestContext)
    return user?.role === 'admin' ? user : null
}
