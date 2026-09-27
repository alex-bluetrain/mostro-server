import { describe, it, expect } from 'vitest'
import { callerEmail, toolCallerEmail } from './caller-email'

const ctx = (user: unknown) => ({ get: ((k: string) => (k === 'user' ? user : undefined)) as any })

describe('callerEmail', () => {
    it('reads the authenticated user email, normalized', () => {
        expect(callerEmail(ctx({ email: ' Ana@Example.com ' }))).toBe('ana@example.com')
    })

    it('returns undefined without a user or a valid email', () => {
        expect(callerEmail(undefined)).toBeUndefined()
        expect(callerEmail(ctx({ id: 'admin' }))).toBeUndefined()
    })
})

describe('toolCallerEmail', () => {
    it('prefers the conversation owner', () => {
        expect(
            toolCallerEmail({ agent: { resourceId: 'ana@example.com' }, requestContext: ctx({ email: 'otro@example.com' }) })
        ).toBe('ana@example.com')
    })

    it('falls back to the authenticated caller when there is no owner (Studio chat)', () => {
        expect(toolCallerEmail({ agent: {}, requestContext: ctx({ email: 'admin@example.com' }) })).toBe('admin@example.com')
    })

    it('ignores a resourceId that is not an email (Studio sends the agent id)', () => {
        expect(
            toolCallerEmail({ agent: { resourceId: 'mostro-supervisor' }, requestContext: ctx({ email: 'admin@example.com' }) })
        ).toBe('admin@example.com')
    })
})
