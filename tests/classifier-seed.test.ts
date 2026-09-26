import { beforeEach, describe, expect, it, vi } from 'vitest'

const validRules = JSON.stringify({
    outcomes: [{ label: 'confirmada', condition: 'el mail confirma la entrega' }],
    'default-outcome': { label: 'revisar' },
})

const config: Record<string, string | undefined> = {}

const hasActivePointer = vi.fn(async (_domain: string) => false)
const publishSnapshot = vi.fn(async (_input: unknown) => 1)
const appLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }

vi.mock('@config/app.config', () => ({ appConfig: config }))
vi.mock('@lib/app-logger', () => ({ appLogger }))
vi.mock('@business/repositories', () => ({
    classifierRepository: {
        hasActivePointer: (domain: string) => hasActivePointer(domain),
        publishSnapshot: (input: unknown) => publishSnapshot(input),
    },
}))

const { ensureClassifierSeed } = await import('@lib/classifier-seed')

describe('ensureClassifierSeed', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        hasActivePointer.mockImplementation(async () => false)
        publishSnapshot.mockImplementation(async () => 1)
        config.CLASSIFIER_RULES_DIAPERS = undefined
        config.CLASSIFIER_RULES_MEDS = undefined
        config.CLASSIFIER_RULES_REFUNDS = undefined
    })

    it('with an active pointer publishes nothing, even if there is a template in env', async () => {
        hasActivePointer.mockImplementation(async () => true)
        config.CLASSIFIER_RULES_DIAPERS = validRules

        await ensureClassifierSeed()

        expect(publishSnapshot).not.toHaveBeenCalled()
    })

    it('without a pointer and with a valid template publishes the initial snapshot', async () => {
        config.CLASSIFIER_RULES_DIAPERS = validRules

        await ensureClassifierSeed()

        expect(publishSnapshot).toHaveBeenCalledExactlyOnceWith({
            domain: 'diapers',
            author: 'boot-seed',
            changelog: 'seed automático desde env',
            rules: JSON.parse(validRules),
        })
    })

    it('without a pointer and without a template warns via error and does not crash boot', async () => {
        await expect(ensureClassifierSeed()).resolves.toBeUndefined()

        expect(publishSnapshot).not.toHaveBeenCalled()
        expect(appLogger.error).toHaveBeenCalledTimes(3)
        expect(appLogger.error.mock.calls[0]?.[0]).toContain('CLASSIFIER_RULES_DIAPERS')
    })

    it('an empty template is treated as absent', async () => {
        config.CLASSIFIER_RULES_MEDS = '   '

        await ensureClassifierSeed()

        expect(publishSnapshot).not.toHaveBeenCalled()
        expect(appLogger.error.mock.calls[1]?.[0]).toContain('CLASSIFIER_RULES_MEDS')
    })

    it('an invalid template does not publish or throw, and does not stop the other domains', async () => {
        config.CLASSIFIER_RULES_DIAPERS = '{ no soy json'
        config.CLASSIFIER_RULES_MEDS = JSON.stringify({ outcomes: [] })
        config.CLASSIFIER_RULES_REFUNDS = validRules

        await expect(ensureClassifierSeed()).resolves.toBeUndefined()

        expect(publishSnapshot).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ domain: 'refunds' }))
        expect(appLogger.error).toHaveBeenCalledTimes(2)
    })
})
