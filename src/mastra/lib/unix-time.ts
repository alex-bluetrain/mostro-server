import { z } from 'zod'

// Workflow state dates: unix timestamp in seconds.
export const unixTimestampSchema = z.number().int().describe('Unix timestamp en segundos')

export function nowUnix(): number {
    return Math.floor(Date.now() / 1000)
}

// Converts a date string (ISO or YYYY-MM-DD) to a unix timestamp in seconds.
export function toUnix(date: string): number {
    return Math.floor(new Date(date).getTime() / 1000)
}

// YYYY-MM-DD legible para avisos a usuarios.
export function formatUnixDate(ts: number): string {
    return new Date(ts * 1000).toISOString().slice(0, 10)
}
