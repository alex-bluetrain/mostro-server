import type { gmail_v1 } from '@googleapis/gmail'

// Gmail adds an X-Received header on every hop with the date that hop received the mail.
// The first one, added by the origin server -the oldest of all- is the sender's real send
// date: it doesn't depend on when Gmail finished delivering it to this mailbox or on
// retries in the delivery queue. That's why it determines the mail's year-month
// deterministically, with no need to try more than one month when resuming a run.
export function resolveMailDate(
    headers: gmail_v1.Schema$MessagePartHeader[] | undefined,
    fallback: Date,
): Date {
    const dates = (headers ?? [])
        .filter(h => h.name?.toLowerCase() === 'x-received')
        .map(h => parseReceivedDate(h.value))
        .filter((d): d is Date => d !== null)

    if (dates.length === 0) return fallback

    return dates.reduce((min, d) => (d < min ? d : min))
}

// The value looks like "by ...; Wed, 30 Jul 2026 08:12:33 -0700 (PDT)": the date comes after
// the last ";".
function parseReceivedDate(value: string | null | undefined): Date | null {
    if (!value) return null
    const dateString = value.slice(value.lastIndexOf(';') + 1).trim()
    const date = new Date(dateString)
    return Number.isNaN(date.getTime()) ? null : date
}
