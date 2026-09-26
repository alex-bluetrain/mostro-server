// The Gmail API takes the whole message (headers + body) in a single `raw` field,
// base64url-encoded. This builds it.

// RFC 2047: headers are ASCII, so a subject with accents travels encoded.
function encodeSubject(subject: string): string {
    return `=?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`
}

export function buildRawMessage({
    from,
    to,
    subject,
    text,
}: {
    from: string
    to: string
    subject: string
    text: string
}): string {
    const headers = [
        `From: ${from}`,
        `To: ${to}`,
        `Subject: ${encodeSubject(subject)}`,
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        // Without this the RFC 2045 default is 7bit, but the bodies carry accents (pañales, Depósito).
        'Content-Transfer-Encoding: 8bit',
    ]

    const message = `${headers.join('\r\n')}\r\n\r\n${text}`
    return Buffer.from(message, 'utf8').toString('base64url')
}
