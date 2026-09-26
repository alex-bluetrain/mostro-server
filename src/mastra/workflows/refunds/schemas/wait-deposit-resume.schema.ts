import { z } from 'zod'

// Same as wait-diapers-confirmation-resume.schema.ts: this contract is no longer filled only by a
// trusted webhook, but also by an LLM extraction. The regex keeps a badly formatted
// date from reaching toUnix() and leaving the run `failed` with no way to resume it.
export const waitDepositResumeSchema = z.object({
    depositAmount: z.number().describe('monto depositado en pesos, sin símbolo de moneda'),
    depositDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'la fecha debe tener el formato YYYY-MM-DD').describe('fecha del depósito en formato YYYY-MM-DD'),
})
