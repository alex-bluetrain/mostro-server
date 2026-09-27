import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { userRepository } from '@business/repositories'
import { resolveRequestUser } from '@lib/request-identity'

export const subscribeTool = createTool({
    id: 'subscribe-notifications',
    description: 'Suscribe al usuario actual para recibir avisos por Telegram sobre las novedades de la paciente: entregas de pañales, pedidos de medicamentos y reembolsos.',
    inputSchema: z.object({}),
    outputSchema: z.object({
        subscribed: z.boolean(),
    }),
    execute: async (_input, context) => {
        const email = (await resolveRequestUser(context?.requestContext))?.email
        if (!email) {
            return { subscribed: false }
        }

        // Turns the preference on for an existing user: if the email isn't
        // invited there's no one to subscribe, and saying yes would be a lie.
        const updated = await userRepository.setNotifications(email, true)
        return { subscribed: updated }
    },
})
