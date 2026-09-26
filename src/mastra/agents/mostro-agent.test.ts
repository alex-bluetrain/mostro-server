import { describe, expect, it } from 'vitest'
import { RequestContext } from '@mastra/core/request-context'
import { MOSTRO_INSTRUCTIONS, mostroInstructions } from './mostro-agent'
import { CHANNEL_KEY } from '@lib/web-thread'

function contextFor(channel?: string) {
    const requestContext = new RequestContext()
    if (channel) requestContext.set(CHANNEL_KEY, channel)
    return { requestContext }
}

describe('mostroInstructions', () => {
    // The OpenUI prompt requires the whole answer to be openui-lang. If it leaks
    // to Telegram, the bot stops sending text and becomes unusable: this test is
    // the safety net against that regression.
    it('leaves the Telegram instructions intact (with the date prepended)', () => {
        const instructions = mostroInstructions(contextFor())

        expect(instructions).toContain(MOSTRO_INSTRUCTIONS)
        expect(instructions).toMatch(/^Today is \d{4}-\d{2}-\d{2}/)
        expect(instructions).not.toMatch(/openui-lang/)
    })

    it('does not leak openui-lang to non-web channels', () => {
        expect(mostroInstructions(contextFor('telegram'))).not.toMatch(/openui-lang/)
    })

    it('adds the OpenUI prompt on web', () => {
        const instructions = mostroInstructions(contextFor('web'))

        expect(instructions).toMatch(/openui-lang/)
        expect(instructions).toContain('Channel: web (OpenUI)')
    })

    it('keeps the business rules on web', () => {
        const instructions = mostroInstructions(contextFor('web'))

        // The format changes, the behavior does not: business rules and tone still apply.
        expect(instructions).toContain(MOSTRO_INSTRUCTIONS)
    })
})
