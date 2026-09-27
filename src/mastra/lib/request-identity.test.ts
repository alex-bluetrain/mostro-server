import { describe, expect, it, vi } from 'vitest'
import { RequestContext, MASTRA_RESOURCE_ID_KEY } from '@mastra/core/request-context'
import { CALLER_KEY, isRequestAdmin, resolveRequestUser, type RequestIdentityDeps } from './request-identity'
import type { IUser } from '@business'

const admin = { email: 'ana@example.com', name: 'Ana', role: 'admin' } as IUser
const member = { email: 'juan@example.com', name: 'Juan', role: 'member' } as IUser

function depsWith(getUserByEmail = vi.fn().mockResolvedValue(null)): RequestIdentityDeps {
    return { getUserByEmail }
}

function httpContext(email: string): RequestContext {
    const requestContext = new RequestContext()
    requestContext.set('user', { email })
    return requestContext
}

describe('resolveRequestUser', () => {
    it('resolves the verified HTTP user by email (Google, web session, Studio key)', async () => {
        const deps = depsWith(vi.fn().mockResolvedValue(admin))

        const user = await resolveRequestUser(httpContext('Ana@Example.com '), deps)

        expect(user).toBe(admin)
        expect(deps.getUserByEmail).toHaveBeenCalledWith('ana@example.com')
    })

    it('returns the user stamped by the channel gate without a lookup', async () => {
        const deps = depsWith()
        const requestContext = new RequestContext()
        requestContext.set(CALLER_KEY, member)

        expect(await resolveRequestUser(requestContext, deps)).toBe(member)
        expect(deps.getUserByEmail).not.toHaveBeenCalled()
    })

    it('ignores the memory resourceId: it is not an identity', async () => {
        const deps = depsWith(vi.fn().mockResolvedValue(admin))
        const requestContext = new RequestContext()
        requestContext.set(MASTRA_RESOURCE_ID_KEY, 'ana@example.com')

        expect(await resolveRequestUser(requestContext, deps)).toBeNull()
        expect(deps.getUserByEmail).not.toHaveBeenCalled()
    })

    it('returns null without requestContext or identity (metadata reads)', async () => {
        const deps = depsWith()

        expect(await resolveRequestUser(undefined, deps)).toBeNull()
        expect(await resolveRequestUser(new RequestContext(), deps)).toBeNull()
    })

    it('caches the lookup per RequestContext (the filter runs per candidate)', async () => {
        const deps = depsWith(vi.fn().mockResolvedValue(admin))
        const requestContext = httpContext('ana@example.com')

        await resolveRequestUser(requestContext, deps)
        await resolveRequestUser(requestContext, deps)

        expect(deps.getUserByEmail).toHaveBeenCalledTimes(1)
    })
})

describe('isRequestAdmin', () => {
    it('true only for the admin role', async () => {
        const deps = depsWith(vi.fn(async (email: string) => (email === admin.email ? admin : member)))

        expect(await isRequestAdmin(httpContext('ana@example.com'), deps)).toBe(true)
        expect(await isRequestAdmin(httpContext('juan@example.com'), deps)).toBe(false)
        expect(await isRequestAdmin(undefined, deps)).toBe(false)
    })
})
