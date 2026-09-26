import { beforeEach, describe, expect, it, vi } from 'vitest'

const config: Record<string, string | undefined> = {
    STUDIO_API_KEY: 'k'.repeat(32),
    GOOGLE_CLIENT_ID: 'client-id',
}

vi.mock('@config/app.config', () => ({ appConfig: config }))
vi.mock('@lib/app-logger', () => ({ appLogger: { info: vi.fn(), warn: vi.fn() } }))

const { createServerAuth } = await import('@lib/server-auth')

describe('createServerAuth', () => {
    beforeEach(() => {
        config.STUDIO_API_KEY = 'k'.repeat(32)
        config.GOOGLE_CLIENT_ID = 'client-id'
    })

    it('with both secrets combines google and studio auth', () => {
        const auth = createServerAuth() as any
        expect(auth.constructor.name).toBe('CompositeAuth')
        // The Telegram webhook must stay public: CompositeAuth merges every
        // provider's `public`, and if it's lost the bot stops working.
        expect(auth.public).toHaveLength(2)
    })

    it('with only STUDIO_API_KEY uses SimpleAuth, exempt from the EE license gate', () => {
        config.GOOGLE_CLIENT_ID = undefined
        const auth = createServerAuth() as any
        expect(auth.isSimpleAuth).toBe(true)
    })

    it('with no secret at all fails at boot instead of leaving the server open', () => {
        config.STUDIO_API_KEY = undefined
        config.GOOGLE_CLIENT_ID = undefined
        expect(() => createServerAuth()).toThrow(/no auth provider/)
    })
})
