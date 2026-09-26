import { z } from 'zod'

// Same as wait-diapers-confirmation-resume.schema.ts: this contract is no longer filled only by a
// trusted webhook, but also by an LLM extraction. The regex keeps a badly formatted
// date from reaching toUnix() and leaving the run `failed` with no way to resume it.
export const waitMedsConfirmationResumeSchema = z.object({
    deliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'la fecha debe tener el formato YYYY-MM-DD').describe('fecha de entrega en formato YYYY-MM-DD'),
    deliveryAddress: z.string().describe('domicilio de entrega completo'),
})
