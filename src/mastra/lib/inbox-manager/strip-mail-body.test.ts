import { describe, it, expect } from 'vitest'
import { stripMailBody } from './strip-mail-body'

function encode(text: string) {
    return Buffer.from(text, 'utf-8').toString('base64url')
}

describe('stripMailBody', () => {
    it('returns plain text as-is when there are no quotes', () => {
        const payload = {
            mimeType: 'text/plain',
            body: { data: encode('Confirmamos la entrega para el 11/03.') },
        }

        expect(stripMailBody(payload)).toBe('Confirmamos la entrega para el 11/03.')
    })

    it('cuts the quoted thread from plain text', () => {
        const payload = {
            mimeType: 'text/plain',
            body: { data: encode('Confirmamos la entrega para el 11/03.\n\n> Cuando entregan?\n> Gracias.') },
        }

        expect(stripMailBody(payload)).toBe('Confirmamos la entrega para el 11/03.')
    })

    it('extracts the text of an html-only mail with cheerio', () => {
        const payload = {
            mimeType: 'text/html',
            body: { data: encode('<html><body><p>Confirmamos la entrega para el <b>11/03</b>.</p></body></html>') },
        }

        expect(stripMailBody(payload)).toBe('Confirmamos la entrega para el 11/03.')
    })

    it('drops <style>/<script> content and separates table cells with a space', () => {
        const payload = {
            mimeType: 'text/html',
            body: {
                data: encode(`<html><head><style>.foo { color: red; }</style></head><body>
                    <script>alert('no debería aparecer');</script>
                    <table><tr><td>Fecha</td><td>11/03</td></tr></table>
                </body></html>`),
            },
        }

        const result = stripMailBody(payload)

        expect(result).not.toContain('color: red')
        expect(result).not.toContain('alert')
        expect(result).toContain('Fecha 11/03')
    })

    it('prefers text/plain over text/html when both are present', () => {
        const payload = {
            mimeType: 'multipart/alternative',
            parts: [
                { mimeType: 'text/plain', body: { data: encode('versión en texto plano') } },
                { mimeType: 'text/html', body: { data: encode('<p>versión en html</p>') } },
            ],
        }

        expect(stripMailBody(payload)).toBe('versión en texto plano')
    })

    it('finds the plain part nested inside multipart/mixed > multipart/alternative', () => {
        const payload = {
            mimeType: 'multipart/mixed',
            parts: [
                {
                    mimeType: 'multipart/alternative',
                    parts: [
                        { mimeType: 'text/plain', body: { data: encode('contenido anidado') } },
                    ],
                },
                { mimeType: 'application/pdf', body: { data: encode('binario-irrelevante') } },
            ],
        }

        expect(stripMailBody(payload)).toBe('contenido anidado')
    })

    it('returns an empty string when there is no text part', () => {
        const payload = {
            mimeType: 'multipart/mixed',
            parts: [
                { mimeType: 'application/pdf', body: { data: encode('binario') } },
            ],
        }

        expect(stripMailBody(payload)).toBe('')
    })

    it('returns an empty string with an undefined payload', () => {
        expect(stripMailBody(undefined)).toBe('')
    })
})
