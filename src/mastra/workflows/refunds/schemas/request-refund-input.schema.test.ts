import { describe, it, expect } from 'vitest'
import { requestRefundInputSchema } from './request-refund-input.schema'

describe('requestRefundInputSchema', () => {
    it('acepta monto con requestedBy', () => {
        const result = requestRefundInputSchema.safeParse({ amount: 100, requestedBy: 'Ana' })
        expect(result.success).toBe(true)
    })

    it('rechaza sin requestedBy', () => {
        const result = requestRefundInputSchema.safeParse({ amount: 100 })
        expect(result.success).toBe(false)
    })

    it('rejects an empty requestedBy', () => {
        const result = requestRefundInputSchema.safeParse({ amount: 100, requestedBy: '' })
        expect(result.success).toBe(false)
    })
})
