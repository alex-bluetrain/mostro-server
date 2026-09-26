import type { gmail } from '@googleapis/gmail'
import type { Mastra } from '@mastra/core/mastra'
import { z } from 'zod'
import { getGmailClient } from '@lib/mailer/gmail-client'
import { stripMailBody } from './strip-mail-body'
import { resolveMailDate } from './resolve-mail-date'

export type GmailClient = ReturnType<typeof gmail>

// Processing status labels, orthogonal to the classification label. A mail with
// any of these three was already processed and the fetch query excludes it.
export const OUTCOME_COMPLETED = 'outcome.completed'
export const OUTCOME_FAILED = 'outcome.failed'
export const OUTCOME_REVIEW = 'outcome.review'

export type InboxManagerConfig = {
    queryDescription: string
}

export type FetchedMail = {
    id: string
    text: string
    year: number
    month: number
}

// The only module that talks to Gmail: reads mails and applies labels. It doesn't classify or run
// side effects — that's mail-classifier's and outcome-processor's job.
export class InboxManager {
    initialized = false
    private query!: string
    private readonly gmail: GmailClient

    constructor(
        private readonly config: InboxManagerConfig,
        gmailClientOverride?: GmailClient,
    ) {
        this.gmail = gmailClientOverride ?? getGmailClient()
    }

    // Idempotent: the instance can be declared at module level (where `mastra` doesn't
    // exist yet) and init(mastra) called on every run; only the first one does any work.
    async init(mastra: Mastra): Promise<void> {
        if (this.initialized) return
        const translated = await translateQuery(mastra, this.config.queryDescription)
        // The exclusions are static: mail without a status label = not processed. They
        // don't depend on the classification rules, so there's no need to derive them from Mongo.
        const exclusions = [OUTCOME_COMPLETED, OUTCOME_FAILED, OUTCOME_REVIEW].map(label => `-label:${label}`)
        this.query = [translated, ...exclusions].join(' ')
        this.initialized = true
        mastra.getLogger().info(`[inbox-manager] query traducida: ${this.query}`)
    }

    async fetch(): Promise<FetchedMail[]> {
        if (!this.initialized) throw new Error('InboxManager: call init() before fetch()')

        const { data } = await this.gmail.users.messages.list({ userId: 'me', q: this.query })
        // Gmail's messages.list returns newest to oldest and has no ascending-order parameter,
        // so reversing is enough to process oldest to newest without sorting by date.
        const ids = (data.messages ?? []).map(m => m.id).filter((id): id is string => Boolean(id)).reverse()

        const mails: FetchedMail[] = []
        for (const id of ids) {
            const { data: raw } = await this.gmail.users.messages.get({ userId: 'me', id, format: 'full' })
            const text = stripMailBody(raw.payload)
            const internalDate = raw.internalDate ? new Date(Number(raw.internalDate)) : new Date()
            const sentAt = resolveMailDate(raw.payload?.headers ?? undefined, internalDate)
            mails.push({ id, text, year: sentAt.getFullYear(), month: sentAt.getMonth() + 1 })
        }
        return mails
    }

    async applyLabel(messageId: string, label: string): Promise<void> {
        const labelId = await this.resolveLabelId(label)
        await this.gmail.users.messages.modify({
            userId: 'me',
            id: messageId,
            requestBody: { addLabelIds: [labelId] },
        })
    }

    private async resolveLabelId(label: string): Promise<string> {
        const { data } = await this.gmail.users.labels.list({ userId: 'me' })
        const existing = data.labels?.find(l => l.name === label)
        if (existing?.id) return existing.id

        const created = await this.gmail.users.labels.create({
            userId: 'me',
            requestBody: { name: label, labelListVisibility: 'labelShow', messageListVisibility: 'show' },
        })
        if (!created.data.id) throw new Error(`Gmail returned no id for label "${label}"`)
        return created.data.id
    }
}

async function translateQuery(mastra: Mastra, queryDescription: string): Promise<string> {
    const agent = mastra.getAgent('inboxClassifier')
    const schema = z.object({ query: z.string().min(1) })
    const prompt = `Convertí esta descripción a una query de búsqueda de Gmail (sintaxis de users.messages.list: from:, newer_than:, label:, -label:, etc.).

Descripción: ${queryDescription}`
    const response = await agent.generate(prompt, { structuredOutput: { schema, errorStrategy: 'strict' } })
    return schema.parse(response.object).query
}
