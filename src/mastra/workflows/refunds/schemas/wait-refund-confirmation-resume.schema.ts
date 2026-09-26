import { z } from 'zod'

export const waitRefundConfirmationResumeSchema = z.object({
    // Confirmation reference sent by the payment processor via webhook
    refundReference: z.string().describe('número o código de referencia del reintegro'),
})
