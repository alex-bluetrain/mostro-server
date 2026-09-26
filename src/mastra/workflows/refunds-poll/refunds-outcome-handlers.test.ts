import { describe, it, expect, vi } from 'vitest'

vi.mock('@lib/refunds-run', () => ({
    acknowledgeRefund: vi.fn().mockResolvedValue({ ok: true }),
    confirmRefund: vi.fn().mockResolvedValue({ ok: true }),
    receiveDeposit: vi.fn().mockResolvedValue({ ok: true }),
}))

import { confirmRefund, receiveDeposit } from '@lib/refunds-run'
import { refundsOutcomeHandlers } from './refunds-outcome-handlers'

const mastra = {} as never

describe('refundsOutcomeHandlers', () => {
    it('refunds.deposited takes the year from the context and the month from depositDate', async () => {
        const data = { depositAmount: 15000, depositDate: '2025-01-16' }

        const result = await refundsOutcomeHandlers['refunds.deposited']({
            mastra,
            text: '',
            year: 2026,
            month: 8,
            data,
        })

        expect(result).toEqual({ ok: true })
        expect(receiveDeposit).toHaveBeenCalledWith(mastra, {
            depositAmount: 15000,
            depositDate: '2025-01-16',
            year: 2026,
            month: 1,
        })
    })

    it('refunds.approved uses the month from the context (no extracted date)', async () => {
        const data = { refundReference: 'REF-123' }

        const result = await refundsOutcomeHandlers['refunds.approved']({
            mastra,
            text: '',
            year: 2026,
            month: 1,
            data,
        })

        expect(result).toEqual({ ok: true })
        expect(confirmRefund).toHaveBeenCalledWith(mastra, {
            refundReference: 'REF-123',
            year: 2026,
            month: 1,
        })
    })
})
