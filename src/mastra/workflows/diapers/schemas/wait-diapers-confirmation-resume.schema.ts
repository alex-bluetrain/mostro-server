import { z } from 'zod'

// Resume contract: originally the payload of a trusted webhook, but
// now it's also filled by an LLM extraction against the pharmacy's mail (see
// mail-extractor.ts). A plausible but badly formatted date ("11/03/2026") would pass a
// bare z.string(), toUnix() would turn it into NaN, and the state would reject it with the run
// already `failed` (not `suspended`) — unrecoverable, because readSuspendedStep doesn't see a
// failed run. The regex makes the model (with strict structured output) reject it before
// touching the run: the mail falls to mostro-failed and the month survives intact.
export const waitDiapersConfirmationResumeSchema = z.object({
    deliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'la fecha debe tener el formato YYYY-MM-DD').describe('fecha de entrega en formato YYYY-MM-DD'),
    deliveryAddress: z.string().describe('domicilio de entrega completo'),
    quantity: z.number().describe('cantidad de pañales, número entero'),
})
