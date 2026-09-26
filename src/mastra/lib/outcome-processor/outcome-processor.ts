import type { Mastra } from '@mastra/core/mastra'

export type HandleContext = {
    mastra: Mastra
    text: string
    year: number
    month: number
    data: unknown
}

export type HandleResult = { ok: true } | { ok: false; reason: string }

// Adapts the {ok, reason?} returned by the *-run.ts helpers to the HandleResult the
// step expects, dropping internal fields (status, suspendedStep, etc) it doesn't care about.
export function toHandleResult(result: { ok: boolean; reason?: string }): HandleResult {
    return result.ok ? { ok: true } : { ok: false, reason: result.reason ?? 'unknown' }
}

export type OutcomeHandlers = Record<string, (ctx: HandleContext) => Promise<HandleResult>>

// Runs the side effect tied to a classification label. A label with no registered
// handler = outcome with no side effects, considered completed.
export async function processOutcome(handlers: OutcomeHandlers, label: string, ctx: HandleContext): Promise<HandleResult> {
    const handler = handlers[label]
    if (!handler) return { ok: true }
    return handler(ctx)
}
