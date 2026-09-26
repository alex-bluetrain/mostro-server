import { appConfig } from '@config/app.config'
import { inviteRepository, userRepository } from '@business/repositories'
import type { IInvite } from '@business'

export type CreateInviteResult =
    | { ok: true; link: string; expiresAt: number }
    | { ok: false; error: string }

export function inviteLink(code: string): string {
    return `https://t.me/${appConfig.TELEGRAM_BOT_USERNAME}?start=${code}`
}

// Inviting is the same whether it's asked for via chat or from the admin screen, so the
// rule lives here and not in each entry point: the already-authenticated caller only says who
// it is. An email with a telegramId already redeemed its invite; inviting it again only
// generates a useless link.
export async function createInvite(caller: { email: string; role: string }, email: string): Promise<CreateInviteResult> {
    if (caller.role !== 'admin') {
        return { ok: false, error: 'only admins can create invites' }
    }

    const existing = await userRepository.findByEmail(email)
    if (existing?.telegramId) {
        return { ok: false, error: 'that email already belongs to an active user' }
    }

    const invite = await inviteRepository.create({ createdBy: caller.email, email })
    return { ok: true, link: inviteLink(invite.code), expiresAt: invite.expiresAt }
}

export type InviteStatus = 'used' | 'expired' | 'pending'

export function inviteStatus(invite: IInvite, now: number): InviteStatus {
    if (invite.usedBy) return 'used'
    return invite.expiresAt <= now ? 'expired' : 'pending'
}
