// Generates diapers/meds/refunds runs in past months using the real workflow
// engine, to test web reporting without going through the mail cycle.
// It doesn't insert snapshots by hand: it runs start + resumes from the *-run.ts helpers,
// leaving each run in whatever intermediate state the scenario asks for.
//
// The mailer runs in dry-run (MAILER_DRY_RUN) and no agents are registered:
// the notify steps advance the state with sent = 0.
//
// Usage: pnpm seed:runs                       (all 3 domains)
//      pnpm seed:runs -- --domain diapers   (just one)

import { parseArgs } from 'node:util'
import mongoose from 'mongoose'
import { Mastra } from '@mastra/core/mastra'
import { createWorkflowStateReader } from '@mastra/core/workflows'
import { MongoDBStore } from '@mastra/mongodb'
import { appConfig } from '@config/app.config'
import { diapersWorkflow } from '@workflows/diapers/diapers.workflow'
import { medsWorkflow } from '@workflows/meds/meds.workflow'
import { refundsWorkflow } from '@workflows/refunds/refunds.workflow'
import { getDiapersRunId } from '@workflows/diapers/utils/diapers.utils'
import { getMedsRunId } from '@workflows/meds/utils/meds.utils'
import { getRefundsRunId } from '@workflows/refunds/utils/refunds.utils'
import { startDiapers, confirmDiapersDate } from '@lib/diapers-run'
import { startMedsOrder, acknowledgeMedsOrder, confirmMedsDelivery } from '@lib/meds-run'
import { startRefundRequest, acknowledgeRefund, confirmRefund, receiveDeposit } from '@lib/refunds-run'

// The check happens when sendEmail() runs, so setting it here
// (after the hoisted imports) lands before any workflow runs.
process.env.MAILER_DRY_RUN = 'true'

const DOMAINS = ['diapers', 'meds', 'refunds'] as const
type Domain = (typeof DOMAINS)[number]

// ── Scenarios (editable) ────────────────────────────────────────────────────
// Always fictitious data: the repo is public.

type DiapersScenario = {
    year: number
    month: number
    size: 'M' | 'G' | 'XG'
    requestedBy: string
    confirm?: { deliveryDate: string; deliveryAddress: string; quantity: number }
}

// A full year: 2025-08 → 2026-07 (the current month, 2026-08, has the real
// order and is left alone). Mostly completed, with a few intermediate states.
const ADDRESS = 'Calle Falsa 123'

const diapersScenarios: DiapersScenario[] = [
    { year: 2025, month: 8, size: 'M', requestedBy: 'Ana', confirm: { deliveryDate: '2025-08-11', deliveryAddress: ADDRESS, quantity: 60 } },
    { year: 2025, month: 9, size: 'M', requestedBy: 'Alex', confirm: { deliveryDate: '2025-09-09', deliveryAddress: ADDRESS, quantity: 60 } },
    { year: 2025, month: 10, size: 'M', requestedBy: 'Ana', confirm: { deliveryDate: '2025-10-14', deliveryAddress: ADDRESS, quantity: 70 } },
    { year: 2025, month: 11, size: 'G', requestedBy: 'Ana', confirm: { deliveryDate: '2025-11-12', deliveryAddress: ADDRESS, quantity: 70 } },
    { year: 2025, month: 12, size: 'G', requestedBy: 'Alex', confirm: { deliveryDate: '2025-12-10', deliveryAddress: ADDRESS, quantity: 90 } },
    { year: 2026, month: 1, size: 'G', requestedBy: 'Ana', confirm: { deliveryDate: '2026-01-13', deliveryAddress: ADDRESS, quantity: 80 } },
    { year: 2026, month: 2, size: 'G', requestedBy: 'Alex', confirm: { deliveryDate: '2026-02-11', deliveryAddress: ADDRESS, quantity: 80 } },
    { year: 2026, month: 3, size: 'G', requestedBy: 'Ana', confirm: { deliveryDate: '2026-03-12', deliveryAddress: ADDRESS, quantity: 100 } },
    { year: 2026, month: 4, size: 'XG', requestedBy: 'Alex', confirm: { deliveryDate: '2026-04-14', deliveryAddress: ADDRESS, quantity: 90 } },
    // Suspendido esperando al proveedor (diapers_requested)
    { year: 2026, month: 5, size: 'M', requestedBy: 'Ana' },
    // Completo: confirmado + notificado (diapers_notification_sent)
    { year: 2026, month: 6, size: 'G', requestedBy: 'Alex', confirm: { deliveryDate: '2026-06-12', deliveryAddress: ADDRESS, quantity: 80 } },
    { year: 2026, month: 7, size: 'XG', requestedBy: 'Ana', confirm: { deliveryDate: '2026-07-15', deliveryAddress: ADDRESS, quantity: 110 } },
]

type MedsScenario = {
    year: number
    month: number
    medications: string[]
    requestedBy: string
    ack?: true
    confirm?: { deliveryDate: string; deliveryAddress: string }
}

const medsScenarios: MedsScenario[] = [
    { year: 2025, month: 8, medications: ['Enalapril 10', 'Aspirina 100'], requestedBy: 'Ana', ack: true, confirm: { deliveryDate: '2025-08-08', deliveryAddress: ADDRESS } },
    { year: 2025, month: 9, medications: ['Enalapril 10', 'Aspirina 100'], requestedBy: 'Alex', ack: true, confirm: { deliveryDate: '2025-09-10', deliveryAddress: ADDRESS } },
    { year: 2025, month: 10, medications: ['Enalapril 10', 'Omeprazol 20'], requestedBy: 'Ana', ack: true, confirm: { deliveryDate: '2025-10-09', deliveryAddress: ADDRESS } },
    { year: 2025, month: 11, medications: ['Enalapril 10', 'Omeprazol 20'], requestedBy: 'Ana', ack: true, confirm: { deliveryDate: '2025-11-11', deliveryAddress: ADDRESS } },
    { year: 2025, month: 12, medications: ['Enalapril 10', 'Ibuprofeno 600'], requestedBy: 'Alex', ack: true, confirm: { deliveryDate: '2025-12-11', deliveryAddress: ADDRESS } },
    { year: 2026, month: 1, medications: ['Enalapril 10', 'Aspirina 100'], requestedBy: 'Ana', ack: true, confirm: { deliveryDate: '2026-01-09', deliveryAddress: ADDRESS } },
    { year: 2026, month: 2, medications: ['Enalapril 10', 'Aspirina 100'], requestedBy: 'Alex', ack: true, confirm: { deliveryDate: '2026-02-10', deliveryAddress: ADDRESS } },
    { year: 2026, month: 3, medications: ['Enalapril 10', 'Levotiroxina 50'], requestedBy: 'Ana', ack: true, confirm: { deliveryDate: '2026-03-11', deliveryAddress: ADDRESS } },
    { year: 2026, month: 4, medications: ['Enalapril 10', 'Levotiroxina 50'], requestedBy: 'Alex', ack: true, confirm: { deliveryDate: '2026-04-09', deliveryAddress: ADDRESS } },
    // Suspendido esperando acuse (meds_requested)
    { year: 2026, month: 5, medications: ['Ibuprofeno 600'], requestedBy: 'Ana' },
    // Acknowledged, waiting for delivery confirmation (ack_notified)
    { year: 2026, month: 6, medications: ['Amoxicilina 500'], requestedBy: 'Alex', ack: true },
    // Completo (meds_notification_sent)
    { year: 2026, month: 7, medications: ['Paracetamol 1g'], requestedBy: 'Ana', ack: true, confirm: { deliveryDate: '2026-07-10', deliveryAddress: ADDRESS } },
]

type RefundsScenario = {
    year: number
    month: number
    amount: number
    requestedBy: string
    reason?: string
    ack?: true
    confirm?: { refundReference: string }
    deposit?: { depositAmount: number; depositDate: string }
}

// `reason` always present: if missing, Mongo persists null and the state schema
// (`reason: z.string().optional()`) rejects the state when validating the resume.
const refundsScenarios: RefundsScenario[] = [
    { year: 2025, month: 8, amount: 12000, reason: 'Consulta médica', requestedBy: 'Ana', ack: true, confirm: { refundReference: 'REF-2025-0801' }, deposit: { depositAmount: 12000, depositDate: '2025-08-22' } },
    { year: 2025, month: 9, amount: 8500, reason: 'Farmacia', requestedBy: 'Alex', ack: true, confirm: { refundReference: 'REF-2025-0901' }, deposit: { depositAmount: 8500, depositDate: '2025-09-19' } },
    { year: 2025, month: 10, amount: 25000, reason: 'Estudios de laboratorio', requestedBy: 'Ana', ack: true, confirm: { refundReference: 'REF-2025-1001' }, deposit: { depositAmount: 25000, depositDate: '2025-10-24' } },
    { year: 2025, month: 11, amount: 14000, reason: 'Sesión de kinesiología', requestedBy: 'Ana', ack: true, confirm: { refundReference: 'REF-2025-1101' }, deposit: { depositAmount: 14000, depositDate: '2025-11-21' } },
    { year: 2025, month: 12, amount: 32000, reason: 'Consulta con especialista', requestedBy: 'Alex', ack: true, confirm: { refundReference: 'REF-2025-1201' }, deposit: { depositAmount: 32000, depositDate: '2025-12-23' } },
    { year: 2026, month: 1, amount: 9500, reason: 'Farmacia', requestedBy: 'Ana', ack: true, confirm: { refundReference: 'REF-2026-0101' }, deposit: { depositAmount: 9500, depositDate: '2026-01-23' } },
    { year: 2026, month: 2, amount: 21000, reason: 'Estudios de imagen', requestedBy: 'Alex', ack: true, confirm: { refundReference: 'REF-2026-0201' }, deposit: { depositAmount: 21000, depositDate: '2026-02-20' } },
    { year: 2026, month: 3, amount: 16500, reason: 'Consulta médica', requestedBy: 'Ana', ack: true, confirm: { refundReference: 'REF-2026-0301' }, deposit: { depositAmount: 16500, depositDate: '2026-03-20' } },
    // Suspendido esperando acuse (refund_requested)
    { year: 2026, month: 4, amount: 15000, reason: 'Consulta médica', requestedBy: 'Ana' },
    // Acusado (ack_notified)
    { year: 2026, month: 5, amount: 22000, reason: 'Estudios de laboratorio', requestedBy: 'Alex', ack: true },
    // Confirmed, waiting for deposit (confirmation_notified)
    {
        year: 2026, month: 6, amount: 18000, reason: 'Sesión de kinesiología', requestedBy: 'Ana', ack: true,
        confirm: { refundReference: 'REF-2026-0601' },
    },
    // Completo (refunds_notification_sent)
    {
        year: 2026, month: 7, amount: 30000, reason: 'Medicamentos', requestedBy: 'Alex', ack: true,
        confirm: { refundReference: 'REF-2026-0702' },
        deposit: { depositAmount: 30000, depositDate: '2026-07-20' },
    },
]

// ── Simulated clock ─────────────────────────────────────────────────────────
// Steps take timestamps with nowUnix() (which uses Date.now), so each
// step runs with Date.now pointing at the simulated moment: the request lands
// between the 1st and 5th of the month and the following steps days later, as in
// reality. Deterministic pseudo-random per run: re-running the seed gives the
// same dates.

const DAY = 86_400

const realDateNow = Date.now.bind(Date)

async function atTime<T>(unixSeconds: number, fn: () => Promise<T>): Promise<T> {
    Date.now = () => unixSeconds * 1000
    try {
        return await fn()
    } finally {
        Date.now = realDateNow
    }
}

// mulberry32: consecutive seeds (month to month) give well-mixed outputs,
// unlike a plain LCG where the first value stays correlated.
function seededRandom(seed: number): () => number {
    return () => {
        seed = (seed + 0x6d2b79f5) | 0
        let t = seed
        t = Math.imul(t ^ (t >>> 15), t | 1)
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

type Timeline = { requestedAt: number; ackAt: number; confirmAt: number; depositAt: number }

function buildTimeline(domain: Domain, year: number, month: number): Timeline {
    const rand = seededRandom(year * 1000 + month * 10 + DOMAINS.indexOf(domain))
    const day = 1 + Math.floor(rand() * 5) // 1..5
    const hour = 9 + Math.floor(rand() * 9) // 9..17
    const requestedAt = Math.floor(Date.UTC(year, month - 1, day, hour, Math.floor(rand() * 60)) / 1000)
    const ackAt = requestedAt + Math.floor((1 + rand() * 2) * DAY) // +1-3 días
    const confirmAt = ackAt + Math.floor((2 + rand() * 3) * DAY) // +2-5 días
    const depositAt = confirmAt + Math.floor((7 + rand() * 8) * DAY) // +7-15 días
    return { requestedAt, ackAt, confirmAt, depositAt }
}

// ── Infra ───────────────────────────────────────────────────────────────────

function fail(message: string): never {
    console.error(`[seed-runs] ${message}`)
    process.exit(1)
}

function parseCliArgs(): { domains: readonly Domain[] } {
    const { values } = parseArgs({ options: { domain: { type: 'string' } } })
    if (!values.domain) return { domains: DOMAINS }
    if (!DOMAINS.includes(values.domain as Domain)) {
        fail(`invalid domain "${values.domain}": must be one of ${DOMAINS.join(', ')}`)
    }
    return { domains: [values.domain as Domain] }
}

function buildMastra(): Mastra {
    const mastra = new Mastra({
        workflows: { diapersWorkflow, medsWorkflow, refundsWorkflow },
        storage: new MongoDBStore({
            id: 'seed-runs-storage',
            uri: appConfig.MONGODB_URI,
            dbName: appConfig.MONGODB_DB_NAME,
        }),
    })

    // The notify steps do `mastra?.getAgent('mostroSupervisor')` with an
    // `if (supervisor)` guard, but getAgent THROWS if the agent isn't registered.
    // Returning undefined reproduces the no-supervisor path: the step skips the
    // Telegram send and advances the state with sent = 0.
    const originalGetAgent = mastra.getAgent.bind(mastra)
    mastra.getAgent = ((name: string) =>
        name === 'mostroSupervisor' ? undefined : originalGetAgent(name as never)) as typeof mastra.getAgent

    return mastra
}

function monthLabel(domain: Domain, year: number, month: number): string {
    return `${domain} ${year}-${String(month).padStart(2, '0')}`
}

const workflowIdByDomain: Record<Domain, string> = {
    diapers: 'diapersWorkflow',
    meds: 'medsWorkflow',
    refunds: 'refundsWorkflow',
}

// The start helpers only skip suspended/running runs: an already completed run
// (success) would be re-executed in full. This check skips it too, so
// running the seed twice is a no-op.
async function runAlreadyDone(mastra: Mastra, domain: Domain, runId: string): Promise<boolean> {
    const existing = await mastra.getWorkflow(workflowIdByDomain[domain]).getWorkflowRunById(runId)
    if (!existing) return false
    return createWorkflowStateReader(existing).getStatus() === 'success'
}

type StartResult =
    | { alreadyInProgress: true; status: string }
    | { alreadyInProgress: false; ok: false; reason: string; message?: string }
    | { alreadyInProgress: false; ok: true; result: unknown }

type StepResult = { ok: true; result: unknown } | { ok: false; reason: string }

// Stops the scenario if start didn't leave a usable new run.
// alreadyInProgress isn't an error: running the seed twice is valid.
function reportStart(label: string, started: StartResult): boolean {
    if (started.alreadyInProgress) {
        console.info(`[seed-runs] ${label}: already in progress (${started.status}), skipped`)
        return false
    }
    if (!started.ok) {
        console.error(`[seed-runs] ${label}: start failed (${started.reason})`)
        return false
    }
    return true
}

function reportStep(label: string, step: string, result: StepResult): boolean {
    if (!result.ok) {
        console.error(`[seed-runs] ${label}: ${step} failed (${result.reason})`)
        return false
    }
    return true
}

// ── Seeds por dominio ───────────────────────────────────────────────────────

async function seedDiapers(mastra: Mastra): Promise<void> {
    for (const s of diapersScenarios) {
        const label = monthLabel('diapers', s.year, s.month)
        if (await runAlreadyDone(mastra, 'diapers', getDiapersRunId(s.year, s.month))) {
            console.info(`[seed-runs] ${label}: ya completado, salteado`)
            continue
        }
        const t = buildTimeline('diapers', s.year, s.month)
        const started = await atTime(t.requestedAt, () => startDiapers(mastra, {
            size: s.size, year: s.year, month: s.month, requestedBy: s.requestedBy,
        }))
        if (!reportStart(label, started)) continue

        if (s.confirm) {
            const confirmed = await atTime(t.confirmAt, () =>
                confirmDiapersDate(mastra, { ...s.confirm!, year: s.year, month: s.month }))
            if (!reportStep(label, 'confirm', confirmed)) continue
        }
        console.info(`[seed-runs] ${label}: ok`)
    }
}

async function seedMeds(mastra: Mastra): Promise<void> {
    for (const s of medsScenarios) {
        const label = monthLabel('meds', s.year, s.month)
        if (await runAlreadyDone(mastra, 'meds', getMedsRunId(s.year, s.month))) {
            console.info(`[seed-runs] ${label}: ya completado, salteado`)
            continue
        }
        const t = buildTimeline('meds', s.year, s.month)
        const started = await atTime(t.requestedAt, () => startMedsOrder(mastra, {
            medications: s.medications, year: s.year, month: s.month, requestedBy: s.requestedBy,
        }))
        if (!reportStart(label, started)) continue

        if (s.ack) {
            const acked = await atTime(t.ackAt, () => acknowledgeMedsOrder(mastra, s.year, s.month))
            if (!reportStep(label, 'ack', acked)) continue
        }
        if (s.confirm) {
            const confirmed = await atTime(t.confirmAt, () =>
                confirmMedsDelivery(mastra, { ...s.confirm!, year: s.year, month: s.month }))
            if (!reportStep(label, 'confirm', confirmed)) continue
        }
        console.info(`[seed-runs] ${label}: ok`)
    }
}

async function seedRefunds(mastra: Mastra): Promise<void> {
    for (const s of refundsScenarios) {
        const label = monthLabel('refunds', s.year, s.month)
        if (await runAlreadyDone(mastra, 'refunds', getRefundsRunId(s.year, s.month))) {
            console.info(`[seed-runs] ${label}: ya completado, salteado`)
            continue
        }
        const t = buildTimeline('refunds', s.year, s.month)
        const started = await atTime(t.requestedAt, () => startRefundRequest(mastra, {
            amount: s.amount, reason: s.reason, year: s.year, month: s.month, requestedBy: s.requestedBy,
        }))
        if (!reportStart(label, started)) continue

        if (s.ack) {
            const acked = await atTime(t.ackAt, () => acknowledgeRefund(mastra, s.year, s.month))
            if (!reportStep(label, 'ack', acked)) continue
        }
        if (s.confirm) {
            const confirmed = await atTime(t.confirmAt, () =>
                confirmRefund(mastra, { ...s.confirm!, year: s.year, month: s.month }))
            if (!reportStep(label, 'confirm', confirmed)) continue
        }
        if (s.deposit) {
            const deposited = await atTime(t.depositAt, () =>
                receiveDeposit(mastra, { ...s.deposit!, year: s.year, month: s.month }))
            if (!reportStep(label, 'deposit', deposited)) continue
        }
        console.info(`[seed-runs] ${label}: ok`)
    }
}

const seedByDomain: Record<Domain, (mastra: Mastra) => Promise<void>> = {
    diapers: seedDiapers,
    meds: seedMeds,
    refunds: seedRefunds,
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
    const { domains } = parseCliArgs()

    // The notify steps query subscribers via mongoose before the supervisor
    // guard, so the connection is needed even if nothing is sent.
    await mongoose.connect(appConfig.MONGODB_URI, { dbName: appConfig.MONGODB_DB_NAME })

    const mastra = buildMastra()
    try {
        for (const domain of domains) {
            await seedByDomain[domain](mastra)
        }
    } finally {
        await mongoose.disconnect()
    }

    console.info('[seed-runs] listo')
    // Mastra's store leaves the connection open; the script is done.
    process.exit(0)
}

await main()
