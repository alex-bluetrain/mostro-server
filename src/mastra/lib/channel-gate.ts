import type { ChannelHandler } from '@mastra/core/channels'
import { findChannelUser, defaultChannelUserDeps, type ChannelUserDeps } from './channel-user'

export type ChannelGateDeps = ChannelUserDeps

// Access gate: runs before the message reaches the agent, so an
// unknown user spends no tokens and doesn't touch memory. Covers every adapter: the
// platform comes from thread.adapter.name, because handlers are registered once
// for the whole channel and don't get the platform as a parameter.
//
// Invite redemption lives in telegram-start.ts: /start arrives as a
// slash command, never as a message, so there's nothing to parse here.
export function createChannelGate(deps: ChannelGateDeps = defaultChannelUserDeps): ChannelHandler {
    return async (thread, message, defaultHandler) => {
        const known = await findChannelUser(deps, thread.adapter.name, message.author.userId)
        if (!known) return
        await defaultHandler(thread, message)
    }
}
