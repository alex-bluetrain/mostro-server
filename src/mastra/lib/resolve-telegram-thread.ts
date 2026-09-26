import { userRepository } from '@business/repositories'
import type { IUser } from '@business'

// Minimal structural types over Mastra's storage so tests
// can stub without dragging in the full instance.
export type MemoryStoreLike = {
    listThreads: (args: {
        filter: { metadata: Record<string, string> }
        perPage: number
    }) => Promise<{ threads: Array<{ id: string }> }>
}
export type StorageLike = {
    getStore: (name: 'memory') => Promise<MemoryStoreLike | undefined>
}
export type MastraLike = {
    getStorage: () => StorageLike | undefined
}

export type ResolveTelegramThreadDeps = {
    getUserByEmail: (email: string) => Promise<IUser | null>
}

const defaultDeps: ResolveTelegramThreadDeps = {
    getUserByEmail: email => userRepository.findByEmail(email),
}

// Subscribers store only the canonical email; the delivery thread is
// resolved here at send time. A Telegram DM has a deterministic external id
// `telegram:<telegramId>` and Mastra persists it in the internal thread's
// metadata (channel_externalThreadId) — the same lookup the framework does
// for incoming messages. Null = nowhere to deliver (the
// user never talked to the bot): the caller logs and skips.
export function createResolveTelegramThread(deps: ResolveTelegramThreadDeps = defaultDeps) {
    return async (
        mastra: MastraLike | undefined,
        email: string,
    ): Promise<{ resourceId: string; threadId: string } | null> => {
        const user = await deps.getUserByEmail(email)
        if (!user?.telegramId) return null

        const memoryStore = await mastra?.getStorage()?.getStore('memory')
        if (!memoryStore) return null

        const { threads } = await memoryStore.listThreads({
            filter: { metadata: { channel_externalThreadId: `telegram:${user.telegramId}` } },
            perPage: 1,
        })
        const thread = threads[0]
        if (!thread) return null

        return { resourceId: email, threadId: thread.id }
    }
}

export const resolveTelegramThread = createResolveTelegramThread()
