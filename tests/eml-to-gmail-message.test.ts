import { describe, it, expect } from 'vitest'
import { emlToGmailMessage, fixtureUrl } from './fixtures/eml-to-gmail-message'
import { stripMailBody } from '@lib/inbox-manager/strip-mail-body'

// This file guards the use of the internal `MailParser.tree` API (see comment in
// eml-to-gmail-message.ts): if a mailparser upgrade changes that shape, these asserts
// must fail here, in CI, instead of the CLI silently producing a payload different
// from what Gmail actually returns.
describe('emlToGmailMessage', () => {
    it('converts a standalone text/plain mail into a single part with no sub-parts', async () => {
        const { payload } = await emlToGmailMessage(fixtureUrl('confirmacion-entrega.eml'))

        expect(payload.mimeType).toBe('text/plain')
        expect(payload.body?.data).toBeTruthy()
        expect(payload.parts).toBeUndefined()
    })

    it('converts a multipart/alternative mail with a single HTML part (no text/plain)', async () => {
        const { payload } = await emlToGmailMessage(fixtureUrl('mail-html.eml'))

        expect(payload.mimeType).toBe('multipart/alternative')
        expect(payload.body).toBeUndefined()
        expect(payload.parts).toHaveLength(1)
        expect(payload.parts?.[0].mimeType).toBe('text/html')
        expect(payload.parts?.some(p => p.mimeType === 'text/plain')).toBe(false)
    })

    it('keeps the root node headers (Date, From)', async () => {
        const { payload } = await emlToGmailMessage(fixtureUrl('confirmacion-entrega.eml'))

        const headerNames = (payload.headers ?? []).map(h => h.name.toLowerCase())
        expect(headerNames).toContain('date')
        expect(headerNames).toContain('from')

        const from = payload.headers?.find(h => h.name.toLowerCase() === 'from')
        expect(from?.value).toContain('farmacia@proveedor.test')
    })

    it('stripMailBody on the HTML-only mail returns text without tags', async () => {
        const { payload } = await emlToGmailMessage(fixtureUrl('mail-html.eml'))

        const text = stripMailBody(payload)
        expect(text).toContain('Fecha')
        expect(text).toContain('29/07/2026')
        expect(text).not.toContain('<td')
        expect(text).not.toContain('<style')
    })
})
