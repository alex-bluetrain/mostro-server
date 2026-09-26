import { describe, it, expect, afterEach, vi } from 'vitest'
import { GMAIL_TIMEOUT_MS, isInvalidGrant, isRetryable, withGmailRetry } from './gmail-retry'

function httpError(status: number) {
    return Object.assign(new Error(`Request failed with status code ${status}`), { status })
}

describe('GMAIL_TIMEOUT_MS', () => {
    it('es 15 segundos', () => {
        expect(GMAIL_TIMEOUT_MS).toBe(15000)
    })
})

describe('isRetryable', () => {
    it('treats an error without status as retriable (network/timeout)', () => {
        expect(isRetryable(new Error('ECONNRESET'))).toBe(true)
    })

    it('trata 429 y 5xx como retriables', () => {
        expect(isRetryable(httpError(429))).toBe(true)
        expect(isRetryable(httpError(503))).toBe(true)
    })

    it('trata otros 4xx como no retriables', () => {
        expect(isRetryable(httpError(403))).toBe(false)
        expect(isRetryable(httpError(400))).toBe(false)
    })
})

describe('isInvalidGrant', () => {
    it('detects the error via the response.data.error field', () => {
        const error = Object.assign(new Error('x'), { response: { data: { error: 'invalid_grant' } } })
        expect(isInvalidGrant(error)).toBe(true)
    })

    it('detects the error when it comes in the message', () => {
        expect(isInvalidGrant(new Error('invalid_grant: token expired'))).toBe(true)
    })

    it('does not flag a generic error as invalid_grant', () => {
        expect(isInvalidGrant(httpError(503))).toBe(false)
    })
})

describe('withGmailRetry', () => {
    afterEach(() => {
        vi.useRealTimers()
    })

    it('returns the result without retrying when the operation works first time', async () => {
        const operation = vi.fn().mockResolvedValue('ok')

        await expect(withGmailRetry(operation)).resolves.toBe('ok')
        expect(operation).toHaveBeenCalledTimes(1)
    })

    it('retries retriable errors with backoff and ends in success', async () => {
        vi.useFakeTimers()
        const operation = vi.fn()
            .mockRejectedValueOnce(httpError(503))
            .mockRejectedValueOnce(httpError(429))
            .mockResolvedValueOnce('ok')

        const pending = withGmailRetry(operation)
        await vi.advanceTimersByTimeAsync(5000)

        await expect(pending).resolves.toBe('ok')
        expect(operation).toHaveBeenCalledTimes(3)
    })

    it('does not retry a non-retriable error', async () => {
        const operation = vi.fn().mockRejectedValue(httpError(403))

        await expect(withGmailRetry(operation)).rejects.toThrow(/403/)
        expect(operation).toHaveBeenCalledTimes(1)
    })

    it('does not retry an invalid_grant even without a status', async () => {
        const operation = vi.fn().mockRejectedValue(new Error('invalid_grant'))

        await expect(withGmailRetry(operation)).rejects.toThrow('invalid_grant')
        expect(operation).toHaveBeenCalledTimes(1)
    })

    it('gives up after 3 attempts with retriable errors', async () => {
        vi.useFakeTimers()
        const operation = vi.fn().mockRejectedValue(httpError(503))

        const pending = withGmailRetry(operation)
        const assertion = expect(pending).rejects.toThrow(/503/)
        await vi.advanceTimersByTimeAsync(5000)
        await assertion

        expect(operation).toHaveBeenCalledTimes(3)
    })
})
