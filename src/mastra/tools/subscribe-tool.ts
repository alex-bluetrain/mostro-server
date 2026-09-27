import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { toolCallerEmail } from '@lib/caller-email'
import { userRepository } from '@business/repositories'
import { emailFromResourceId } from '@business/identity'

export const subscribeTool = createTool({
    id: 'subscribe-notifications',
    description: 'Suscribe al usuario actual para recibir avisos por Telegram sobre las novedades de la paciente: entregas de pañales, pedidos de medicamentos y reembolsos.',
    inputSchema: z.object({}),
    outputSchema: z.object({
        subscribed: z.boolean(),
    }),
    execute: async (_input, context) => {
        const email = emailFromResourceId(toolCallerEmail(context) ?? '')
        if (!email) {
            return { subscribed: false }
        }

        // Turns the preference on for an existing user: if the email isn't
        // invited there's no one to subscribe, and saying yes would be a lie.
        const updated = await userRepository.setNotifications(email, true)
        return { subscribed: updated }
    },
})
