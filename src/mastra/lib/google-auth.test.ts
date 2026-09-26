import { beforeEach, describe, expect, it, vi } from 'vitest'

const CLIENT_ID = 'client-id.apps.googleusercontent.com'
const config: Record<string, string | undefined> = { GOOGLE_CLIENT_ID: CLIENT_ID }

vi.mock('@config/app.config', () => ({ appConfig: config }))
vi.mock('./app-logger', () => ({ appLogger: { info: vi.fn(), warn: vi.fn() } }))
vi.mock('./invite-gate', () => ({ assertInvitedAndSyncName: vi.fn() }))

const { assertInvitedAndSyncName } = await import('./invite-gate')
const { createGoogleAuth } = await import('./google-auth')

describe('createGoogleAuth', () => {
    beforeEach(() => {
        config.GOOGLE_CLIENT_ID = CLIENT_ID
        vi.mocked(assertInvitedAndSyncName).mockReset().mockResolvedValue(undefined)
    })

    it('does not create the provider without a client id', () => {
        config.GOOGLE_CLIENT_ID = undefined
        expect(createGoogleAuth()).toBeUndefined()
    })

    it('authorizes an invited email and passes emailVerified to the gate', async () => {
        const auth = createGoogleAuth()!
        await expect(
            auth.authorizeUser({ email: 'ana@gmail.com', emailVerified: true, name: 'Ana Pérez' } as any),
        ).resolves.toBe(true)
        expect(assertInvitedAndSyncName).toHaveBeenCalledWith({
            email: 'ana@gmail.com',
            emailVerified: true,
            name: 'Ana Pérez',
        })
    })

    // The id_token can be correctly signed by Google but access is still
    // invite-only: the gate stops it here.
    it('rejects a valid id_token from an unknown email', async () => {
        vi.mocked(assertInvitedAndSyncName).mockRejectedValue(new Error('invite-only'))
        const auth = createGoogleAuth()!
        await expect(auth.authorizeUser({ email: 'stranger@gmail.com', emailVerified: true } as any)).resolves.toBe(false)
    })

    it('rejects a token without an email', async () => {
        const auth = createGoogleAuth()!
        await expect(auth.authorizeUser({ googleId: 'x' } as any)).resolves.toBe(false)
        expect(assertInvitedAndSyncName).not.toHaveBeenCalled()
    })

    it('maps memory to the email, same as telegram', () => {
        const auth = createGoogleAuth()!
        expect(auth.mapUserToResourceId?.({ email: 'ana@gmail.com' } as any)).toBe('ana@gmail.com')
    })
})
