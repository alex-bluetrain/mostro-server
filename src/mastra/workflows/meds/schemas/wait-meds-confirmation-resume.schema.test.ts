import { describe, it, expect } from 'vitest'
import { waitMedsConfirmationResumeSchema } from './wait-meds-confirmation-resume.schema'

describe('waitMedsConfirmationResumeSchema', () => {
    it('accepts a confirmation with a date in YYYY-MM-DD format', () => {
        const result = waitMedsConfirmationResumeSchema.safeParse({
            deliveryDate: '2026-08-01',
            deliveryAddress: 'Av. Siempre Viva 742',
        })
        expect(result.success).toBe(true)
    })

    it('rejects a date in DD/MM/YYYY format', () => {
        const result = waitMedsConfirmationResumeSchema.safeParse({
            deliveryDate: '01/08/2026',
            deliveryAddress: 'Av. Siempre Viva 742',
        })
        expect(result.success).toBe(false)
    })

    it('rejects a date that includes a time', () => {
        const result = waitMedsConfirmationResumeSchema.safeParse({
            deliveryDate: '2026-08-01T10:00:00Z',
            deliveryAddress: 'Av. Siempre Viva 742',
        })
        expect(result.success).toBe(false)
    })

    it('rejects a confirmation without deliveryAddress', () => {
        const result = waitMedsConfirmationResumeSchema.safeParse({
            deliveryDate: '2026-08-01',
        })
        expect(result.success).toBe(false)
    })
})
