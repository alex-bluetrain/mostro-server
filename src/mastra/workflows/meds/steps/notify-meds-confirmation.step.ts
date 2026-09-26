import { createStep } from '@mastra/core/workflows'
import { z } from 'zod'
import { userRepository } from '@business/repositories'
import { resolveTelegramThread } from '@lib/resolve-telegram-thread'
import { formatUnixDate, nowUnix } from '@lib/unix-time'
import { medsStateSchema } from '../schemas/meds-state.schema'
import { notifyMedsConfirmationOutputSchema } from '../schemas/notify-meds-confirmation-output.schema'

export const notifyMedsConfirmationStep = createStep({
    id: 'notify-meds-confirmation',
    inputSchema: z.object({}),
    outputSchema: notifyMedsConfirmationOutputSchema,
    stateSchema: medsStateSchema,
    execute: async ({ state, setState, mastra }) => {
        const emails = await userRepository.listNotificationEmails()

        const agent = mastra?.getAgent('mostroAgent')
        let sent = 0
        if (agent) {
            for (const email of emails) {
                const target = await resolveTelegramThread(mastra, email)
                if (!target) {
                    mastra?.getLogger().warn(`[notify-meds-confirmation] no telegram thread for ${email}, skipping`)
                    continue
                }
                await agent.sendNotificationSignal(
                    {
                        source: 'meds',
                        kind: 'delivery-confirmed',
                        priority: 'high',
                        summary: `[AVISO DEL SISTEMA — NO es un mensaje del usuario, NO requiere acción] Reenviá este aviso tal cual, sin delegar ni usar tools: los medicamentos (${(state.medications ?? []).join(', ') || 'sin especificar'}) llegan el ${state.deliveryDate != null ? formatUnixDate(state.deliveryDate) : 'fecha a confirmar'}.`,
                        payload: {
                            medications: state.medications,
                            deliveryDate: state.deliveryDate,
                            deliveryAddress: state.deliveryAddress,
                        },
                    },
                    target,
                )
                sent++
            }
        }

        await setState({
            ...state,
            status: 'meds_notification_sent',
            notifiedAt: nowUnix(),
            notifiedCount: sent,
        })

        return { notifiedCount: sent }
    },
})
