import { describe, it, expect } from 'vitest'
import { waitDiapersConfirmationResumeSchema } from './wait-diapers-confirmation-resume.schema'

describe('waitDiapersConfirmationResumeSchema', () => {
    it('accepts a confirmation with quantity', () => {
        const result = waitDiapersConfirmationResumeSchema.safeParse({
            deliveryDate: '2026-08-01',
            deliveryAddress: 'Av. Siempre Viva 742',
            quantity: 12,
        })
        expect(result.success).toBe(true)
    })

    it('rejects a confirmation without quantity', () => {
        const result = waitDiapersConfirmationResumeSchema.safeParse({
            deliveryDate: '2026-08-01',
            deliveryAddress: 'Av. Siempre Viva 742',
        })
        expect(result.success).toBe(false)
    })

    it('rejects a date in DD/MM/YYYY format', () => {
        const result = waitDiapersConfirmationResumeSchema.safeParse({
            deliveryDate: '01/08/2026',
            deliveryAddress: 'Av. Siempre Viva 742',
            quantity: 12,
        })
        expect(result.success).toBe(false)
    })

    it('rejects a date that includes a time', () => {
        const result = waitDiapersConfirmationResumeSchema.safeParse({
            deliveryDate: '2026-08-01T10:00:00Z',
            deliveryAddress: 'Av. Siempre Viva 742',
            quantity: 12,
        })
        expect(result.success).toBe(false)
    })
})
