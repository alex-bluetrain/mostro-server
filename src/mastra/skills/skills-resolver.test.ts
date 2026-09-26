import { describe, expect, it, vi, beforeEach } from 'vitest'
import { RequestContext } from '@mastra/core/request-context'

const { isRequestAdminMock } = vi.hoisted(() => ({ isRequestAdminMock: vi.fn() }))

vi.mock('@lib/request-identity', () => ({ isRequestAdmin: isRequestAdminMock }))

import { mostroSkillsResolver } from './skills-resolver'
import { invitacionesSkill } from './invitaciones.skill'
import { weatherSkill } from './weather.skill'

beforeEach(() => {
    isRequestAdminMock.mockReset()
})

describe('mostroSkillsResolver', () => {
    it('exposes invitaciones only to admins (plus the common skills)', async () => {
        isRequestAdminMock.mockResolvedValue(true)

        const skills = await mostroSkillsResolver({ requestContext: new RequestContext() })

        expect(skills).toContain(invitacionesSkill)
        expect(skills).toContain(weatherSkill)
    })

    it('hides gated skills from non-admins (and from metadata reads without identity)', async () => {
        isRequestAdminMock.mockResolvedValue(false)

        const skills = await mostroSkillsResolver({ requestContext: new RequestContext() })

        expect(skills).not.toContain(invitacionesSkill)
        expect(skills).toContain(weatherSkill)
    })
})
