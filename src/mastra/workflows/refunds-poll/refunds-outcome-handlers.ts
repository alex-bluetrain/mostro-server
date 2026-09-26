import { toHandleResult, type OutcomeHandlers } from '@lib/outcome-processor/outcome-processor'
import { monthOfIsoDate } from '@lib/date-scope'
import { acknowledgeRefund, confirmRefund, receiveDeposit } from '@lib/refunds-run'
import { waitDepositResumeSchema } from '../refunds/schemas/wait-deposit-resume.schema'
import { waitRefundConfirmationResumeSchema } from '../refunds/schemas/wait-refund-confirmation-resume.schema'

// These labels MUST match the ones in the rules JSON seeded in Mongo. A label
// classified without a handler here is marked outcome.completed with no side effects.
const REFUNDS_ACKNOWLEDGED = 'refunds.acknowledged'
const REFUNDS_APPROVED = 'refunds.approved'
const REFUNDS_DEPOSITED = 'refunds.deposited'

export const refundsOutcomeHandlers: OutcomeHandlers = {
    [REFUNDS_ACKNOWLEDGED]: async ({ mastra, year, month }) =>
        toHandleResult(await acknowledgeRefund(mastra, year, month)),
    [REFUNDS_APPROVED]: async ({ mastra, year, month, data }) => {
        const { refundReference } = waitRefundConfirmationResumeSchema.parse(data)
        return toHandleResult(await confirmRefund(mastra, { refundReference, year, month }))
    },
    [REFUNDS_DEPOSITED]: async ({ mastra, year, data }) => {
        const { depositAmount, depositDate } = waitDepositResumeSchema.parse(data)
        // Same rule as diapers: month of the deposit, year from the context.
        return toHandleResult(await receiveDeposit(mastra, {
            depositAmount,
            depositDate,
            year,
            month: monthOfIsoDate(depositDate),
        }))
    },
}
