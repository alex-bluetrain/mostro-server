// Retry and timeout policy shared between the mailer (gmail-mailer.ts) and the
// InboxManager (../inbox-manager/inbox-manager.ts): both talk to the same
// Gmail API over the same shared client (./gmail-client.ts) and must treat
// the same transient errors the same way. Don't duplicate this policy there.

const MAX_ATTEMPTS = 3
const BASE_DELAY_MS = 500

// gaxios sets no timeout unless asked: without this, a network hang can take
// undici's default ~300s. Pass it as the second argument of every call to the
// Gmail client: gmail.users.messages.list({...}, { timeout: GMAIL_TIMEOUT_MS }).
export const GMAIL_TIMEOUT_MS = 15000

function httpStatusOf(error: unknown): number | undefined {
    const candidate = error as { status?: number; response?: { status?: number } }
    return candidate?.response?.status ?? candidate?.status
}

// The refresh token was revoked, or the OAuth app stayed in Testing mode and the token died after 7 days.
export function isInvalidGrant(error: unknown): boolean {
    const candidate = error as { message?: string; response?: { data?: { error?: string } } }
    return candidate?.response?.data?.error === 'invalid_grant'
        || (candidate?.message ?? '').includes('invalid_grant')
}

// No HTTP status = network failure or timeout, which is worth retrying.
// A 4xx doesn't improve by waiting: revoked token, invalid recipient, malformed body.
export function isRetryable(error: unknown): boolean {
    const status = httpStatusOf(error)
    if (status === undefined) return true
    if (status === 429) return true
    return status >= 500
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
}

// Retries transient errors (network, 429, 5xx) with exponential backoff. An
// invalid_grant or any other non-retriable error propagates on the first attempt;
// each caller decides how to explain it (the mailer, for example, turns it into a message
// pointing at `pnpm run gmail:auth`).
export async function withGmailRetry<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: unknown

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
            return await operation()
        } catch (error) {
            lastError = error

            if (isInvalidGrant(error) || !isRetryable(error) || attempt === MAX_ATTEMPTS) {
                throw error
            }

            await sleep(BASE_DELAY_MS * 2 ** (attempt - 1))
        }
    }

    // Unreachable: the loop always returns or throws on the last iteration. It's here
    // only so TypeScript sees an exit on every path.
    throw lastError
}
