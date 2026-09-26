import { userRepository, inviteRepository } from '@business/repositories'
import type { IUser, IInvite } from '@business'
import { appLogger } from './app-logger';

export type TelegramStartDeps = {
    getUserByTelegramId: (telegramId: string) => Promise<IUser | null>
    redeemInvite: (code: string, telegramId: string) => Promise<IInvite | null>
    provisionUser: (email: string, telegramId: string, name: string) => Promise<IUser>
}

const defaultDeps: TelegramStartDeps = {
    getUserByTelegramId: telegramId => userRepository.findByTelegramId(telegramId),
    redeemInvite: (code, telegramId) => inviteRepository.redeem(code, telegramId),
    provisionUser: (email, telegramId, name) => userRepository.upsertFromInviteRedeem(email, telegramId, name),
}

// Structural subset of the Chat SDK's SlashCommandEvent: enough for the
// handler, and lets us test it without building a full event.
export type TelegramStartEvent = {
    user: { userId: string; fullName: string }
    text: string
    channel: { post: (message: string) => Promise<unknown> }
}

export const KNOWN_USER_GREETING = '¡Hola de nuevo! Contame en qué te ayudo.'
export const INVALID_INVITE_MESSAGE =
    'No tengo una invitación válida para vos. Pedile a quien te invitó que te genere un link nuevo.'
export const PROVISION_FAILED_MESSAGE =
    'Uy, algo salió mal al activar tu invitación. Pedile a quien te invitó que te genere un link nuevo.'

export function buildWelcomeMessage(name?: string): string {
    const greeting = name ? `¡Hola, ${name}!` : '¡Hola!'
    const intro =
        'Soy Mostro: te ayudo con los pedidos de pañales, medicamentos y reintegros, y te aviso cuando hay novedades.'
    return name ? `${greeting} ${intro}` : `${greeting} ${intro} Para arrancar, ¿cómo te llamás?`
}

// The telegram adapter diverts bot_command to the Chat SDK's slash command
// pipeline, so invite redemption lives here and not in the
// onDirectMessage gate (which never sees /start).
export function createTelegramStartHandler(deps: TelegramStartDeps = defaultDeps) {
    return async (event: TelegramStartEvent): Promise<void> => {
        try {
            const telegramId = event.user.userId
            const known = await deps.getUserByTelegramId(telegramId)
            if (known) {
                await event.channel.post(KNOWN_USER_GREETING)
                return
            }
            const code = event.text.trim()
            if (!code) {
                await event.channel.post(INVALID_INVITE_MESSAGE)
                return
            }
            const invite = await deps.redeemInvite(code, telegramId)
            if (!invite) {
                await event.channel.post(INVALID_INVITE_MESSAGE)
                return
            }
            // The invite was already burned in redeemInvite; if provisioning fails here
            // we still have to tell the invitee instead of leaving them without a reply.
            try {
                const user = await deps.provisionUser(invite.email, telegramId, event.user.fullName.trim())
                await event.channel.post(buildWelcomeMessage(user.name || invite.name))
            } catch (err) {
                appLogger.error('[telegram-start] failed to provision user after redeem', { err })
                await event.channel.post(PROVISION_FAILED_MESSAGE)
            }
        } catch (err) {
            appLogger.error('[telegram-start] failed to handle /start', { err })
        }
    }
}
