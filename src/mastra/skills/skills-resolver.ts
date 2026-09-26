import type { AgentSkillsResolver, SkillInput } from '@mastra/core/skills'
import { isRequestAdmin } from '@lib/request-identity'
import { invitacionesSkill } from './invitaciones.skill'
import { weatherSkill } from './weather.skill'
import { diapersSkill } from './diapers.skill'
import { medsSkill } from './meds.skill'
import { refundsSkill } from './refunds.skill'

// Dynamic resolver for the Mostro agent's skills. Runs once per
// RequestContext, but also on metadata reads (listSkills, server
// endpoints) where there's no tracing span or identity: in that case
// isRequestAdmin returns false and gated skills simply don't show up.
export const mostroSkillsResolver: AgentSkillsResolver = async ({ requestContext }) => {
    const skills: SkillInput[] = [weatherSkill, diapersSkill, medsSkill, refundsSkill]
    if (await isRequestAdmin(requestContext)) skills.push(invitacionesSkill)
    return skills
}
