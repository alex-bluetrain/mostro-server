import { toHandleResult, type OutcomeHandlers } from '@lib/outcome-processor/outcome-processor'
import { monthOfIsoDate } from '@lib/date-scope'
import { acknowledgeMedsOrder, confirmMedsDelivery } from '@lib/meds-run'
import { waitMedsConfirmationResumeSchema } from '../meds/schemas/wait-meds-confirmation-resume.schema'

// These labels MUST match the ones in the rules JSON seeded in Mongo. A label
// classified without a handler here is marked outcome.completed with no side effects.
const MEDS_ACKNOWLEDGED = 'meds.acknowledged'
const MEDS_DELIVERED = 'meds.delivered'

export const medsOutcomeHandlers: OutcomeHandlers = {
    [MEDS_ACKNOWLEDGED]: async ({ mastra, year, month }) =>
        toHandleResult(await acknowledgeMedsOrder(mastra, year, month)),
    [MEDS_DELIVERED]: async ({ mastra, year, data }) => {
        const { deliveryDate, deliveryAddress } = waitMedsConfirmationResumeSchema.parse(data)
        // Same rule as diapers: month of the delivery, year from the context.
        return toHandleResult(await confirmMedsDelivery(mastra, {
            deliveryDate,
            deliveryAddress,
            year,
            month: monthOfIsoDate(deliveryDate),
        }))
    },
}
