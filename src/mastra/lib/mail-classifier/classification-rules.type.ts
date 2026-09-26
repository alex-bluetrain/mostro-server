// Format of the rules JSON that lives in Mongo (see docs/clasificador.md). `extract`
// is plain JSON Schema: it's the source of truth, passed straight to the LLM as structured
// output and validated with ajv. No Zod here on purpose.
export type ExtractSchema = Record<string, unknown>

export type ClassificationOutcome = {
    label: string
    // Natural-language description so the LLM decides whether the mail matches.
    condition: string
    // Few-shot to guide the LLM: fragments of mails that match and that don't.
    examples?: { match?: string[]; no_match?: string[] }
    // Present only if there's data to extract from the mail on a match.
    extract?: ExtractSchema
}

export type ClassificationRules = {
    outcomes: ClassificationOutcome[]
    // Applied when no outcome matches. Not terminal: it flags the mail for
    // manual intervention (the step adds outcome.review).
    'default-outcome': { label: string }
}
