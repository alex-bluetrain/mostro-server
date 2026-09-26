import { describe, it, expect } from 'vitest'
import { waitDepositResumeSchema } from './wait-deposit-resume.schema'

describe('waitDepositResumeSchema', () => {
    it('accepts a deposit with a date in YYYY-MM-DD format', () => {
        const result = waitDepositResumeSchema.safeParse({
            depositAmount: 500,
            depositDate: '2026-08-15',
        })
        expect(result.success).toBe(true)
    })

    it('rejects a date in DD/MM/YYYY format', () => {
        const result = waitDepositResumeSchema.safeParse({
            depositAmount: 500,
            depositDate: '15/08/2026',
        })
        expect(result.success).toBe(false)
    })

    it('rejects a date that includes a time', () => {
        const result = waitDepositResumeSchema.safeParse({
            depositAmount: 500,
            depositDate: '2026-08-15T10:00:00Z',
        })
        expect(result.success).toBe(false)
    })

    it('rejects a deposit without depositAmount', () => {
        const result = waitDepositResumeSchema.safeParse({
            depositDate: '2026-08-15',
        })
        expect(result.success).toBe(false)
    })
})
