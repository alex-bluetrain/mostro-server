import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { resolveRequestUser } from '@lib/request-identity'
import { userRepository } from '@business/repositories'

export const setMyNameTool = createTool({
    id: 'set-my-name',
    description: 'Guarda o actualiza el nombre del usuario actual (cómo quiere que lo llamen). Usar cuando un usuario nuevo dice su nombre o cuando alguien pide cambiarlo.',
    inputSchema: z.object({
        name: z.string().min(1).describe('Nombre elegido por el usuario'),
    }),
    outputSchema: z.object({
        ok: z.boolean(),
    }),
    execute: async (input, context) => {
        const user = await resolveRequestUser(context?.requestContext)
        if (!user) {
            return { ok: false }
        }
        const ok = await userRepository.setUserName(user.email, input.name)
        return { ok }
    },
})
