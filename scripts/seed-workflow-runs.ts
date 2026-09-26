// Generates two years of diapers/meds/refunds runs (the 24 months before the
// current one) using the real workflow engine, to test web reporting without
// going through the mail cycle.
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
    const ackAt = requestedAt + Math.floor((1 + rand() * 2) * DAY) // +1-3 days
    const confirmAt = ackAt + Math.floor((2 + rand() * 3) * DAY) // +2-5 days
    const depositAt = confirmAt + Math.floor((7 + rand() * 8) * DAY) // +7-15 days
    return { requestedAt, ackAt, confirmAt, depositAt }
}

function isoDate(unixSeconds: number): string {
    return new Date(unixSeconds * 1000).toISOString().slice(0, 10)
}

// ── Scenarios ───────────────────────────────────────────────────────────────
// Always fictitious data: the repo is public.
//
// The 24 months before the current one (the current month holds the real
// order and is left alone). Mostly completed; the most recent months stay in
// intermediate states so the reports show every stage. Values are
// pseudo-random per month, so re-running the seed in the same month is a no-op.

const MONTHS = 24
const ADDRESS = 'Calle Falsa 123'
const PEOPLE = ['Ana', 'Alex']
const SIZES = ['M', 'G', 'XG'] as const
const MEDICATIONS = [
    ['Enalapril 10', 'Aspirina 100'],
    ['Enalapril 10', 'Omeprazol 20'],
    ['Enalapril 10', 'Ibuprofeno 600'],
    ['Enalapril 10', 'Levotiroxina 50'],
    ['Amoxicilina 500'],
    ['Paracetamol 1g'],
]
const REASONS = [
    'Consulta médica', 'Farmacia', 'Estudios de laboratorio', 'Sesión de kinesiología',
    'Consulta con especialista', 'Estudios de imagen', 'Medicamentos',
]

function pick<T>(rand: () => number, items: readonly T[]): T {
    return items[Math.floor(rand() * items.length)]
}

// `age` is how many months back: 1 = last month, MONTHS = two years ago.
type SeedMonth = { year: number; month: number; age: number }

function pastMonths(count: number): SeedMonth[] {
    const now = new Date()
    const months: SeedMonth[] = []
    for (let age = count; age >= 1; age--) {
        const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - age, 1))
        months.push({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, age })
    }
    return months
}

function monthRandom(domain: Domain, year: number, month: number): () => number {
    // Offset from buildTimeline's seed so values and dates aren't correlated.
    return seededRandom(year * 1000 + month * 10 + DOMAINS.indexOf(domain) + 7)
}

type DiapersScenario = {
    year: number
    month: number
    size: 'M' | 'G' | 'XG'
    requestedBy: string
    confirm?: { deliveryDate: string; deliveryAddress: string; quantity: number }
}

// Age 2: suspended waiting for the provider (diapers_requested).
const diapersScenarios: DiapersScenario[] = pastMonths(MONTHS).map(({ year, month, age }) => {
    const rand = monthRandom('diapers', year, month)
    const t = buildTimeline('diapers', year, month)
    return {
        year, month,
        size: pick(rand, SIZES),
        requestedBy: pick(rand, PEOPLE),
        confirm: age === 2 ? undefined : {
            deliveryDate: isoDate(t.confirmAt), deliveryAddress: ADDRESS, quantity: 60 + 10 * Math.floor(rand() * 6),
        },
    }
})

type MedsScenario = {
    year: number
    month: number
    medications: string[]
    requestedBy: string
    ack?: true
    confirm?: { deliveryDate: string; deliveryAddress: string }
}

// Age 3: waiting for acknowledgement (meds_requested).
// Age 2: acknowledged, waiting for delivery confirmation (ack_notified).
const medsScenarios: MedsScenario[] = pastMonths(MONTHS).map(({ year, month, age }) => {
    const rand = monthRandom('meds', year, month)
    const t = buildTimeline('meds', year, month)
    return {
        year, month,
        medications: pick(rand, MEDICATIONS),
        requestedBy: pick(rand, PEOPLE),
        ack: age === 3 ? undefined : true,
        confirm: age === 2 || age === 3 ? undefined : { deliveryDate: isoDate(t.confirmAt), deliveryAddress: ADDRESS },
    }
})

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
// Age 4: waiting for acknowledgement (refund_requested).
// Age 3: acknowledged (ack_notified).
// Age 2: confirmed, waiting for the deposit (confirmation_notified).
const refundsScenarios: RefundsScenario[] = pastMonths(MONTHS).map(({ year, month, age }) => {
    const rand = monthRandom('refunds', year, month)
    const t = buildTimeline('refunds', year, month)
    const amount = 5000 + 500 * Math.floor(rand() * 55) // 5.000..32.000
    return {
        year, month, amount,
        reason: pick(rand, REASONS),
        requestedBy: pick(rand, PEOPLE),
        ack: age === 4 ? undefined : true,
        confirm: age === 3 || age === 4 ? undefined : { refundReference: `REF-${year}-${String(month).padStart(2, '0')}01` },
        deposit: age >= 2 && age <= 4 ? undefined : { depositAmount: amount, depositDate: isoDate(t.depositAt) },
    }
})

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

// ── Per-domain seeds ───────────────────────────────────────────────────────

async function seedDiapers(mastra: Mastra): Promise<void> {
    for (const s of diapersScenarios) {
        const label = monthLabel('diapers', s.year, s.month)
        if (await runAlreadyDone(mastra, 'diapers', getDiapersRunId(s.year, s.month))) {
            console.info(`[seed-runs] ${label}: already completed, skipped`)
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
            console.info(`[seed-runs] ${label}: already completed, skipped`)
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
            console.info(`[seed-runs] ${label}: already completed, skipped`)
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

    console.info('[seed-runs] done')
    // Mastra's store leaves the connection open; the script is done.
    process.exit(0)
}

await main()
