import { describe, expect, it, vi } from 'vitest'
import { RequestContext } from '@mastra/core/request-context'
import { createChannelGate, type ChannelGateDeps } from '@lib/channel-gate'
import { CALLER_KEY, resolveRequestUser } from '@lib/request-identity'
import type { IUser } from '@business'

const member: IUser = { email: 'ana@gmail.com', telegramId: '111', discordId: '999999999999999999', name: 'Ana', role: 'member', addedAt: 1, preferences: { notifications: false } }

function makeDeps(overrides: Partial<ChannelGateDeps> = {}): ChannelGateDeps {
    return {
        getUserByTelegramId: vi.fn(async () => null),
        getUserByDiscordId: vi.fn(async () => null),
        ...overrides,
    }
}

function makeMessage(senderId: string, text: string) {
    return { author: { userId: senderId }, text } as any
}

function makeThread(platform: string) {
    return { adapter: { name: platform } } as any
}

function makeCtx() {
    return { requestContext: new RequestContext() } as any
}

describe('createChannelGate', () => {
    it('usuario registrado pasa al defaultHandler', async () => {
        const deps = makeDeps({ getUserByTelegramId: vi.fn(async () => member) })
        const defaultHandler = vi.fn(async () => {})
        const message = makeMessage('111', 'hola')
        const thread = makeThread('telegram')
        const ctx = makeCtx()
        await createChannelGate(deps)(thread, message, defaultHandler, ctx)
        expect(defaultHandler).toHaveBeenCalledExactlyOnceWith(thread, message)
        // Tools downstream read the caller the gate verified, with no second lookup.
        expect(ctx.requestContext.get(CALLER_KEY)).toBe(member)
        expect(await resolveRequestUser(ctx.requestContext)).toBe(member)
    })

    it('an unknown user is silently ignored', async () => {
        const deps = makeDeps()
        const defaultHandler = vi.fn(async () => {})
        await createChannelGate(deps)(makeThread('telegram'), makeMessage('222', 'hola'), defaultHandler, makeCtx())
        expect(defaultHandler).not.toHaveBeenCalled()
    })

    it('resolves by discordId when the message comes via discord', async () => {
        const getUserByDiscordId = vi.fn(async () => member)
        const deps = makeDeps({ getUserByDiscordId })
        const defaultHandler = vi.fn(async () => {})
        await createChannelGate(deps)(makeThread('discord'), makeMessage('999999999999999999', 'hola'), defaultHandler, makeCtx())
        expect(getUserByDiscordId).toHaveBeenCalledWith('999999999999999999')
        expect(deps.getUserByTelegramId).not.toHaveBeenCalled()
        expect(defaultHandler).toHaveBeenCalledOnce()
    })

    // A valid telegramId must not open the door on Discord: they're different
    // id spaces and crossing them would let in anyone with the number.
    it('no cruza identidades entre plataformas', async () => {
        const deps = makeDeps({ getUserByTelegramId: vi.fn(async () => member) })
        const defaultHandler = vi.fn(async () => {})
        await createChannelGate(deps)(makeThread('discord'), makeMessage('111', 'hola'), defaultHandler, makeCtx())
        expect(defaultHandler).not.toHaveBeenCalled()
    })

    it('rechaza plataformas sin identidad mapeada', async () => {
        const deps = makeDeps({ getUserByTelegramId: vi.fn(async () => member) })
        const defaultHandler = vi.fn(async () => {})
        await createChannelGate(deps)(makeThread('slack'), makeMessage('111', 'hola'), defaultHandler, makeCtx())
        expect(defaultHandler).not.toHaveBeenCalled()
    })
})
