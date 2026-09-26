import { describe, it, expect, beforeEach, vi } from 'vitest'

// The step instantiates the InboxManager on import, so the mocks must exist
// before the module: vi.hoisted lifts them along with vi.mock.
const { fetchMails, applyLabel } = vi.hoisted(() => ({ fetchMails: vi.fn(), applyLabel: vi.fn() }))

vi.mock('@lib/inbox-manager/inbox-manager', async importOriginal => ({
    ...(await importOriginal<typeof import('@lib/inbox-manager/inbox-manager')>()),
    InboxManager: class {
        initialized = true
        init = vi.fn()
        fetch = fetchMails
        applyLabel = applyLabel
    },
}))

vi.mock('@business/repositories', () => ({
    classifierRepository: { findActiveRules: vi.fn() },
}))

vi.mock('@lib/mail-classifier/mail-classifier', () => ({
    classifyMail: vi.fn(),
}))

import { pollDiapersMailbox } from './poll-diapers-mailbox.step'
import { classifierRepository } from '@business/repositories'
import { classifyMail } from '@lib/mail-classifier/mail-classifier'

const logger = { warn: vi.fn(), info: vi.fn(), error: vi.fn() }
const mastra = { getLogger: () => logger }

function execute() {
    return (pollDiapersMailbox.execute as any)({ mastra, inputData: { dryRun: true } })
}

describe('poll-diapers-mailbox step', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it("doesn't touch the mailbox if the domain has no rules yet", async () => {
        vi.mocked(classifierRepository.findActiveRules).mockResolvedValue(null)

        await expect(execute()).resolves.toEqual({ ok: true })
        expect(fetchMails).not.toHaveBeenCalled()
    })

    it('logs which domain has no rules, so it can be acted on', async () => {
        vi.mocked(classifierRepository.findActiveRules).mockResolvedValue(null)

        await execute()

        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('diapers'))
    })

    it('processes the mailbox when there are active rules', async () => {
        vi.mocked(classifierRepository.findActiveRules).mockResolvedValue({ outcomes: [] } as any)
        fetchMails.mockResolvedValue([{ id: 'mail-1', text: 'hola', year: 2026, month: 7 }])
        vi.mocked(classifyMail).mockResolvedValue({ label: 'confirmado', data: {}, isDefault: false } as any)

        await execute()

        expect(fetchMails).toHaveBeenCalled()
        expect(classifyMail).toHaveBeenCalledWith(mastra, 'hola', { outcomes: [] })
    })
})
