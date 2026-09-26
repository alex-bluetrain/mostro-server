import { classifierRepository } from '@business/repositories'
import type { ClassifierDomain } from '@business/models/classifier-snapshot.model'
import { appConfig } from '@config/app.config'
import { appLogger } from './app-logger'
import { validateRules } from './mail-classifier/validate-rules'

// Seed-if-missing bootstrap for the classification rules, at the same lifecycle
// point as ensureAdminSeed(). The rules are a precondition of the polls,
// not an optional seed: without an active pointer the workflow fails on every run.
//
// Deliberate semantics: if the domain already has a pointer, it's NOT touched. Once
// the admin front exists, its edits are the truth and this bootstrap never overwrites them.
const ENV_VAR_NAME: Record<ClassifierDomain, string> = {
    diapers: 'CLASSIFIER_RULES_DIAPERS',
    meds: 'CLASSIFIER_RULES_MEDS',
    refunds: 'CLASSIFIER_RULES_REFUNDS',
}

export async function ensureClassifierSeed(): Promise<void> {
    const templates: Record<ClassifierDomain, string | undefined> = {
        diapers: appConfig.CLASSIFIER_RULES_DIAPERS,
        meds: appConfig.CLASSIFIER_RULES_MEDS,
        refunds: appConfig.CLASSIFIER_RULES_REFUNDS,
    }

    for (const domain of Object.keys(templates) as ClassifierDomain[]) {
        if (await classifierRepository.hasActivePointer(domain)) {
            appLogger.info(`[classifier-seed] "${domain}" ya tiene puntero activo, no se toca`)
            continue
        }

        const template = templates[domain]?.trim()
        if (!template) {
            appLogger.error(
                `[classifier-seed] ⚠ dominio "${domain}" sin reglas activas y sin ${ENV_VAR_NAME[domain]} — el workflow ${domain}-poll va a fallar en cada corrida`
            )
            continue
        }

        // A broken domain must not stop the boot: the other domains and the
        // Telegram bot have to keep working.
        try {
            const rules = validateRules(JSON.parse(template))
            const version = await classifierRepository.publishSnapshot({
                domain,
                author: 'boot-seed',
                changelog: 'seed automático desde env',
                rules,
            })
            appLogger.info(`[classifier-seed] "${domain}" seedeado: snapshot v${version} (${rules.outcomes.length} outcomes)`)
        } catch (error) {
            appLogger.error(
                `[classifier-seed] ⚠ ${ENV_VAR_NAME[domain]} inválida, "${domain}" queda sin reglas: ${error instanceof Error ? error.message : error}`
            )
        }
    }
}
