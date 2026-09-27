import type { ChannelHandler } from '@mastra/core/channels'
import { findChannelUser, defaultChannelUserDeps, type ChannelUserDeps } from './channel-user'
import { CALLER_KEY } from './request-identity'

export type ChannelGateDeps = ChannelUserDeps

// Access gate: runs before the message reaches the agent, so an
// unknown user spends no tokens and doesn't touch memory. Covers every adapter: the
// platform comes from thread.adapter.name, because handlers are registered once
// for the whole channel and don't get the platform as a parameter.
//
// The user it finds is the caller: it's stamped on the run's requestContext so
// tools and permission checks read it instead of looking it up again.
//
// Invite redemption lives in telegram-start.ts: /start arrives as a
// slash command, never as a message, so there's nothing to parse here.
export function createChannelGate(deps: ChannelGateDeps = defaultChannelUserDeps): ChannelHandler {
    return async (thread, message, defaultHandler, ctx) => {
        const known = await findChannelUser(deps, thread.adapter.name, message.author.userId)
        if (!known) return
        ctx.requestContext.set(CALLER_KEY, known)
        await defaultHandler(thread, message)
    }
}
