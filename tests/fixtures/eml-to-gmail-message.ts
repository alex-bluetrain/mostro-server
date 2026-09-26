import { readFile } from 'node:fs/promises'
import { MailParser } from 'mailparser'

export type GmailHeader = { name: string; value: string }

export type GmailPart = {
    mimeType: string
    headers?: GmailHeader[]
    body?: { data: string }
    parts?: GmailPart[]
}

export type GmailMessage = {
    id: string
    internalDate: string
    payload: GmailPart
}

// `MailParser.tree` isn't in the `@types/mailparser` types: it's the internal tree
// mailparser builds while parsing, but it has exactly the shape we need to mimic
// what Gmail's `users.messages.get({format:'full'})` returns. The cast below is the only
// place this shape is assumed; tests/eml-to-gmail-message.test.ts guards it: if a mailparser
// upgrade changes it, that test breaks in CI instead of the CLI silently lying.
type MimeHeaderLine = { key: string; line: string }
type MimeNode = {
    contentType: string
    headerLines: MimeHeaderLine[]
    textContent?: string
    children: MimeNode[]
}

function encode(text: string): string {
    return Buffer.from(text, 'utf-8').toString('base64url')
}

function toHeaders(headerLines: MimeHeaderLine[]): GmailHeader[] {
    return headerLines.map(h => ({
        name: h.key,
        value: h.line.slice(h.line.indexOf(':') + 1).trim(),
    }))
}

function toGmailPart(node: MimeNode): GmailPart {
    const part: GmailPart = { mimeType: node.contentType }
    if (node.headerLines.length > 0) part.headers = toHeaders(node.headerLines)
    if (node.textContent) part.body = { data: encode(node.textContent) }
    if (node.children.length > 0) part.parts = node.children.map(toGmailPart)
    return part
}

export function fixtureUrl(name: string): URL {
    return new URL(`./mails/${name}`, import.meta.url)
}

export async function emlToGmailMessage(source: Buffer | URL | string): Promise<GmailMessage> {
    const buffer = Buffer.isBuffer(source) ? source : await readFile(source)

    const parser = new MailParser()
    const ended = new Promise<void>((resolve, reject) => {
        parser.on('error', reject)
        // Attachments stall the parser until they're "released": if their data isn't drained
        // and release() isn't called, a real .eml with images/PDFs never fires 'end'.
        parser.on('data', (data: { type: string; release?: () => void }) => {
            if (data.type === 'attachment' && data.release) data.release()
        })
        parser.on('end', resolve)
    })
    parser.end(buffer)
    await ended

    const tree = (parser as unknown as { tree: MimeNode }).tree
    const payload = toGmailPart(tree)

    const dateHeader = tree.headerLines.find(h => h.key === 'date')
    const internalDate = dateHeader
        ? String(new Date(dateHeader.line.slice(dateHeader.line.indexOf(':') + 1).trim()).getTime())
        : String(Date.now())

    return { id: 'eml-local', internalDate, payload }
}
