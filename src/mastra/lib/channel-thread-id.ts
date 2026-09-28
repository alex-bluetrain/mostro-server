// Single thread-id convention: `<email>:<channel>`.
//
// The email is already the canonical resourceId (see resolve-resource-id.ts), so
// deriving the thread from it gives an id computable from anywhere: no need
// to look up the thread by metadata to know where to deliver something.
//
// One thread per channel, not a global one: the Telegram, web and Android
// conversations stay separate, but share the resourceId, so resource memory
// (who the user is, what they asked for) stays common to all of them.
export type ThreadChannel = 'telegram' | 'web' | 'android'

export function channelThreadId(email: string, channel: ThreadChannel): string {
    return `${email}:${channel}`
}
