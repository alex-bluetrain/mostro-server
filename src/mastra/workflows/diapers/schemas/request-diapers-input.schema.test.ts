import { describe, it, expect } from 'vitest'
import { requestDiapersInputSchema } from './request-diapers-input.schema'

describe('requestDiapersInputSchema', () => {
    it.each(['M', 'G', 'XG'])('acepta el talle %s con requestedBy', (size) => {
        const result = requestDiapersInputSchema.safeParse({ size, requestedBy: 'Ana' })
        expect(result.success).toBe(true)
    })

    it('rejects a size outside the enum', () => {
        const result = requestDiapersInputSchema.safeParse({ size: 'L', requestedBy: 'Ana' })
        expect(result.success).toBe(false)
    })

    it('rejects a request without a size', () => {
        const result = requestDiapersInputSchema.safeParse({ requestedBy: 'Ana' })
        expect(result.success).toBe(false)
    })

    it('rejects a request without requestedBy', () => {
        const result = requestDiapersInputSchema.safeParse({ size: 'M' })
        expect(result.success).toBe(false)
    })

    it('rejects an empty requestedBy', () => {
        const result = requestDiapersInputSchema.safeParse({ size: 'M', requestedBy: '' })
        expect(result.success).toBe(false)
    })
})
