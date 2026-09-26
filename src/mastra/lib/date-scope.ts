// Month-scoped flows are identified by year and month: two plain numbers, not a
// dedicated type. The "YYYY-MM" string is a display format (run id suffix, mail subject)
// and is built only at the edge where it's needed.
//
// There's no "current month" here: which month the user meant is a decision, and the LLM makes it
// with the today its instructions inject. The code requires the value, it never invents it.

// The only place where year and month become a string: the run id suffix (`diapers-2026-07`)
// and the mail subjects that mirror it.
export function formatYearMonth(year: number, month: number): string {
    return `${year}-${String(month).padStart(2, '0')}`
}

// Month of a "YYYY-MM-DD" date. Used on dates the LLM extracts from the mail body:
// it can get the year wrong when the text doesn't say it ("estarán llegando el JUEVES 16-01" ->
// 2025-01-16 for a 2026-01 order), but the month is always written. The caller supplies
// the year from its context.
export function monthOfIsoDate(isoDate: string): number {
    return Number(isoDate.slice(5, 7))
}
