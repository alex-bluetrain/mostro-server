import { createWorkflow } from '@mastra/core/workflows'
import { z } from 'zod'

import { pollRefundsMailbox } from './steps/poll-refunds-mailbox.step'

export const refundsPollWorkflow = createWorkflow({
    id: 'refunds-poll',
    // dryRun is only used when triggered by hand from the playground: it classifies and logs,
    // but doesn't label in Gmail or resume workflows. The cron always runs with it false.
    inputSchema: z.object({ dryRun: z.boolean().default(false) }),
    outputSchema: z.object({ ok: z.literal(true) }),
    schedule: {
        // Offset from diapers (2,17,32,47) and meds (7,22,37,52): still every 15
        // minutes, but this way the three domains don't hit the Gmail API at the same
        // instant.
        cron: '12,27,42,57 * * * *',
        timezone: 'America/Argentina/Buenos_Aires',
        inputData: { dryRun: false },
    },
})
    .then(pollRefundsMailbox)
    .commit()
