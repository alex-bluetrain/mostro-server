import { createHmac, timingSafeEqual } from 'node:crypto'

// Signed cookies for the web session. The payload is not secret (an email and
// an expiry), it only has to be tamper-proof, so an HMAC is enough.

export const SESSION_COOKIE = 'mostro_session'
export const SESSION_MAX_AGE_S = 30 * 24 * 60 * 60
// Sliding renewal: re-issue the cookie once less than this is left.
export const SESSION_RENEW_BELOW_S = 15 * 24 * 60 * 60

export function sign(payload: object, secret: string): string {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
    return `${body}.${mac(body, secret)}`
}

export function verify<T extends { exp: number }>(value: string | undefined, secret: string, now = Date.now()): T | null {
    if (!value) return null
    const [body, sig] = value.split('.')
    if (!body || !sig) return null
    const expected = Buffer.from(mac(body, secret))
    const given = Buffer.from(sig)
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null
    try {
        const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as T
        return typeof payload.exp === 'number' && payload.exp * 1000 > now ? payload : null
    } catch {
        return null
    }
}

export function readCookie(header: string | null | undefined, name: string): string | undefined {
    for (const part of header?.split(';') ?? []) {
        const [key, ...rest] = part.trim().split('=')
        if (key === name) return rest.join('=')
    }
    return undefined
}

export function cookieHeader(name: string, value: string, maxAgeS: number, secure: boolean): string {
    return [
        `${name}=${value}`,
        'Path=/',
        `Max-Age=${maxAgeS}`,
        'HttpOnly',
        'SameSite=Lax',
        ...(secure ? ['Secure'] : []),
    ].join('; ')
}

function mac(body: string, secret: string): string {
    return createHmac('sha256', secret).update(body).digest('base64url')
}
