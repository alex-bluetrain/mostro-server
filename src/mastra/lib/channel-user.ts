import { userRepository } from '@business/repositories'
import type { IUser } from '@business'

export type ChannelUserDeps = {
    getUserByTelegramId: (telegramId: string) => Promise<IUser | null>
    getUserByDiscordId: (discordId: string) => Promise<IUser | null>
}

export const defaultChannelUserDeps: ChannelUserDeps = {
    getUserByTelegramId: telegramId => userRepository.findByTelegramId(telegramId),
    getUserByDiscordId: discordId => userRepository.findByDiscordId(discordId),
}

// Maps (platform, author id) to the Mongo user, which is the source of
// truth. Telegram is the signup channel: every user has a telegramId. Discord
// is optional and linked later, so an unowned Discord id is a user
// who hasn't run link-discord yet, not an error.
//
// An unknown platform returns null on purpose: if a new adapter gets plugged in
// tomorrow without mapping its identity, the gate rejects it instead of letting
// anyone in.
export async function findChannelUser(
    deps: ChannelUserDeps,
    platform: string,
    userId: string
): Promise<IUser | null> {
    if (platform === 'telegram') return deps.getUserByTelegramId(userId)
    if (platform === 'discord') return deps.getUserByDiscordId(userId)
    return null
}
