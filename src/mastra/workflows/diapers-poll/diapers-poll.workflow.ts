import { createWorkflow } from '@mastra/core/workflows'
import { z } from 'zod'

import { pollDiapersMailbox } from './steps/poll-diapers-mailbox.step'

export const diapersPollWorkflow = createWorkflow({
    id: 'diapers-poll',
    // dryRun is only used when triggered by hand from the playground: it classifies and logs,
    // but doesn't label in Gmail or resume workflows. The cron always runs with it false.
    inputSchema: z.object({ dryRun: z.boolean().default(false) }),
    outputSchema: z.object({ ok: z.literal(true) }),
    schedule: {
        // Offset from meds (7,22,37,52) and refunds (12,27,42,57): still every 15
        // minutes, but this way the three domains don't hit the Gmail API at the same
        // instant.
        cron: '2,17,32,47 * * * *',
        timezone: 'America/Argentina/Buenos_Aires',
        inputData: { dryRun: false },
    },
})
    .then(pollDiapersMailbox)
    .commit()
