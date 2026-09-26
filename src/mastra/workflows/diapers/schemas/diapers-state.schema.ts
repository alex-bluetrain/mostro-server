import { z } from 'zod'
import { unixTimestampSchema } from '@lib/unix-time'

export const diapersStateSchema = z.object({
    status: z.enum([
        'idle',
        'diapers_requested',
        'diapers_date_confirmed',
        'diapers_notification_sent',
    ]).default('idle'),
    // The order's month: set by whoever starts the run and kept in state, so steps don't
    // have to parse it from the run id.
    year: z.number().int(),
    month: z.number().int().min(1).max(12),
    size: z.enum(['M', 'G', 'XG']).optional(),
    quantity: z.number().optional(),
    requestedBy: z.string().min(1),
    deliveryDate: unixTimestampSchema.optional(),
    deliveryAddress: z.string().optional(),
    requestedAt: unixTimestampSchema.optional(),
    notifiedAt: unixTimestampSchema.optional(),
    notifiedCount: z.number().optional(),
})
