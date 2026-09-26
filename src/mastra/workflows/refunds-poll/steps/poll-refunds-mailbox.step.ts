import { createStep } from '@mastra/core/workflows'
import { z } from 'zod'
import { classifierRepository } from '@business/repositories'
import { InboxManager, OUTCOME_COMPLETED, OUTCOME_FAILED, OUTCOME_REVIEW } from '@lib/inbox-manager/inbox-manager'
import { classifyMail } from '@lib/mail-classifier/mail-classifier'
import { processOutcome } from '@lib/outcome-processor/outcome-processor'
import { refundsInboxConfig } from '../refunds-inbox.config'
import { refundsOutcomeHandlers } from '../refunds-outcome-handlers'

// The real `mastra` only exists once the Mastra instance finishes building, so
// init() (which translates the query) is deferred to the first run. init() is idempotent:
// subsequent cron cycles reuse the already-translated query.
const manager = new InboxManager(refundsInboxConfig)

export const pollRefundsMailbox = createStep({
    id: 'poll-refunds-mailbox',
    inputSchema: z.object({ dryRun: z.boolean().default(false) }),
    outputSchema: z.object({ ok: z.literal(true) }),
    execute: async ({ mastra, inputData: { dryRun } }) => {
        if (!mastra) throw new Error('[poll-refunds-mailbox] no mastra instance available')
        const logger = mastra.getLogger()

        if (!manager.initialized) await manager.init(mastra)

        // Fresh rules from Mongo on every run: publishing a new snapshot takes effect on
        // the next cron cycle without a redeploy.
        const rules = await classifierRepository.findActiveRules('refunds')
        if (!rules) {
            // No rules, nothing to decide: skipping beats touching the mailbox
            // and leaving mails half-processed. The warning already went out at boot.
            logger.warn('[poll-refunds-mailbox] "refunds" has no active rules yet, skipping this run')
            return { ok: true as const }
        }

        const mails = await manager.fetch()

        for (const mail of mails) {
            try {
                const { label, data, isDefault } = await classifyMail(mastra, mail.text, rules)

                if (dryRun) {
                    // Classifying is read-only, so it runs anyway; what gets skipped is
                    // everything that leaves a trace (Gmail labels and workflow resume).
                    logger.info(`[poll-refunds-mailbox] (dry-run) ${mail.id} -> "${label}"${isDefault ? ' (default: would go to review)' : ''}`, { year: mail.year, month: mail.month, data })
                    continue
                }

                await manager.applyLabel(mail.id, label)

                if (isDefault) {
                    // No outcome matched: flagged for manual intervention.
                    await manager.applyLabel(mail.id, OUTCOME_REVIEW)
                    continue
                }

                const result = await processOutcome(refundsOutcomeHandlers, label, { mastra, text: mail.text, year: mail.year, month: mail.month, data })
                if (!result.ok) logger.error(`[poll-refunds-mailbox] ${mail.id} classified as "${label}" but the handler failed: ${result.reason}`)
                await manager.applyLabel(mail.id, result.ok ? OUTCOME_COMPLETED : OUTCOME_FAILED)
            } catch (error) {
                // One broken mail doesn't stop the loop: it's marked failed (best-effort) and we move on.
                logger.error(`[poll-refunds-mailbox] could not process ${mail.id}`, { error })
                if (dryRun) continue
                await manager.applyLabel(mail.id, OUTCOME_FAILED).catch(labelError =>
                    logger.error(`[poll-refunds-mailbox] could not label ${mail.id} as "${OUTCOME_FAILED}"`, { labelError }))
            }
        }

        return { ok: true as const }
    },
})
