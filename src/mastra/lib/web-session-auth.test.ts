import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@config/app.config', () => ({ appConfig: {} }))
vi.mock('./app-logger', () => ({ appLogger: { info: vi.fn(), warn: vi.fn() } }))
vi.mock('./invite-gate', () => ({ assertInvitedAndSyncName: vi.fn() }))
vi.mock('./server-auth', () => ({ TELEGRAM_CHANNEL_WEBHOOK: /telegram/ }))

const { assertInvitedAndSyncName } = await import('./invite-gate')
const { WebSessionAuth, readSession, renewedSessionCookie, sessionCookie, clearSessionCookie } = await import('./web-session-auth')
const { SESSION_MAX_AGE_S } = await import('./web-session')

const config = {
    clientId: 'client-id',
    clientSecret: 'secret',
    cookieSecret: 'x'.repeat(32),
    authUrl: 'https://app.example.com/api',
    appUrl: 'https://app.example.com',
    secure: true,
}
const DAY = 24 * 60 * 60 * 1000
const cookieOf = (setCookie: string) => setCookie.split(';')[0]
const req = (cookie?: string) => new Request('https://app.example.com/api/users/me', { headers: cookie ? { cookie } : {} })

describe('web session cookie', () => {
    beforeEach(() => {
        vi.mocked(assertInvitedAndSyncName).mockReset().mockResolvedValue(undefined)
    })

    it('is HttpOnly, SameSite=Lax, Secure and lasts 30 days', () => {
        const header = sessionCookie('ana@example.com', config)
        expect(header).toContain('HttpOnly')
        expect(header).toContain('SameSite=Lax')
        expect(header).toContain('Secure')
        expect(header).toContain(`Max-Age=${SESSION_MAX_AGE_S}`)
    })

    it('round-trips and authenticates the email', async () => {
        const auth = new WebSessionAuth(config)
        const user = await auth.authenticateToken('', req(cookieOf(sessionCookie('ana@example.com', config))))
        expect(user).toEqual({ id: 'ana@example.com', email: 'ana@example.com' })
        expect(auth.mapUserToResourceId(user!)).toBe('ana@example.com')
    })

    it('rejects a tampered, foreign-key or missing cookie', async () => {
        const auth = new WebSessionAuth(config)
        const good = cookieOf(sessionCookie('ana@example.com', config))
        const [name, value] = good.split('=')
        const [body, sig] = value.split('.')
        const forged = Buffer.from(JSON.stringify({ email: 'admin@example.com', exp: 9e9 })).toString('base64url')
        expect(await auth.authenticateToken('', req(`${name}=${forged}.${sig}`))).toBeNull()
        expect(await auth.authenticateToken('', req(cookieOf(sessionCookie('ana@example.com', { ...config, cookieSecret: 'y'.repeat(32) }))))).toBeNull()
        expect(await auth.authenticateToken('', req())).toBeNull()
        expect(body).toBeTruthy()
    })

    it('expires after 30 days', () => {
        const now = Date.now()
        const cookie = cookieOf(sessionCookie('ana@example.com', config, now))
        expect(readSession(cookie, config, now + 29 * DAY)).not.toBeNull()
        expect(readSession(cookie, config, now + 31 * DAY)).toBeNull()
    })

    it('renews only past half its life', () => {
        const now = Date.now()
        const cookie = cookieOf(sessionCookie('ana@example.com', config, now))
        expect(renewedSessionCookie(cookie, config, now + DAY)).toBeUndefined()
        const renewed = renewedSessionCookie(cookie, config, now + 20 * DAY)
        expect(renewed).toBeDefined()
        expect(readSession(cookieOf(renewed!), config, now + 45 * DAY)).not.toBeNull()
    })

    it('clears with Max-Age=0', () => {
        expect(clearSessionCookie(config)).toContain('Max-Age=0')
    })

    it('re-checks the invite gate on every request', async () => {
        const auth = new WebSessionAuth(config)
        await expect(auth.authorizeUser({ email: 'ana@example.com' })).resolves.toBe(true)
        vi.mocked(assertInvitedAndSyncName).mockRejectedValue(new Error('invite-only'))
        await expect(auth.authorizeUser({ email: 'ana@example.com' })).resolves.toBe(false)
        await expect(auth.authorizeUser({})).resolves.toBe(false)
    })
})
