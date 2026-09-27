import { registerApiRoute } from '@mastra/core/server'
import { callerEmail } from '@lib/caller-email'
import { inviteRepository } from '@business/repositories'
import { createInvite, inviteLink, inviteStatus } from '@lib/invites'
import { nowUnix } from '@lib/unix-time'
import { requireAdmin } from '@lib/require-admin'

export const listInvitesRoute = registerApiRoute('/invites', {
    method: 'GET',
    handler: async c => {
        const admin = await requireAdmin(callerEmail(c.get('requestContext')))
        if (!admin) return c.json({ error: 'Forbidden' }, 403)

        const now = nowUnix()
        const invites = await inviteRepository.list()

        // The code goes out in the link, not as a loose field: the screen shows it
        // for resending, not for looking at.
        return c.json({
            invites: invites.map(invite => ({
                email: invite.email,
                createdBy: invite.createdBy,
                createdAt: invite.createdAt,
                expiresAt: invite.expiresAt,
                status: inviteStatus(invite, now),
                link: inviteLink(invite.code),
            })),
        })
    },
})

export const createInviteRoute = registerApiRoute('/invites', {
    method: 'POST',
    handler: async c => {
        const admin = await requireAdmin(callerEmail(c.get('requestContext')))
        if (!admin) return c.json({ error: 'Forbidden' }, 403)

        const body = await c.req.json().catch(() => null)
        const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
        if (!email.includes('@')) {
            return c.json({ error: 'A valid email is required' }, 400)
        }

        const result = await createInvite(admin, email)
        if (!result.ok) return c.json({ error: result.error }, 409)

        return c.json({ link: result.link, expiresAt: result.expiresAt }, 201)
    },
})
