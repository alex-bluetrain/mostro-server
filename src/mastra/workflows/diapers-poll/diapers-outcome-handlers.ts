import { toHandleResult, type OutcomeHandlers } from '@lib/outcome-processor/outcome-processor'
import { monthOfIsoDate } from '@lib/date-scope'
import { confirmDiapersDate } from '@lib/diapers-run'
import { waitDiapersConfirmationResumeSchema } from '../diapers/schemas/wait-diapers-confirmation-resume.schema'

// These labels MUST match the ones in the rules JSON seeded in Mongo. A label
// classified without a handler here is marked outcome.completed with no side effects.
const DIAPERS_CONFIRMED = 'diapers.confirmed'

export const diapersOutcomeHandlers: OutcomeHandlers = {
    [DIAPERS_CONFIRMED]: async ({ mastra, year, data }) => {
        const { deliveryDate, deliveryAddress, quantity } = waitDiapersConfirmationResumeSchema.parse(data)
        // The order's month is the delivery's, not the mail's: a confirmation can arrive
        // as a late reply to an old thread. The year comes from the context because the LLM
        // can get it wrong when the mail doesn't spell it out.
        return toHandleResult(await confirmDiapersDate(mastra, {
            deliveryDate,
            deliveryAddress,
            quantity,
            year,
            month: monthOfIsoDate(deliveryDate),
        }))
    },
}
