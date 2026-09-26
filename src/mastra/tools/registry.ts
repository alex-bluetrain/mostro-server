import { createInviteTool } from './create-invite-tool'
import { linkDiscordTool } from './link-discord-tool'
import { weatherTool } from './weather-tool'
import { getDiapersStatusTool } from './diapers-get-status-tool'
import { requestDiapersTool } from './diapers-request-tool'
import { getMedsStatusTool } from './meds-get-status-tool'
import { requestMedsTool } from './meds-request-tool'
import { getRefundsStatusTool } from './refunds-get-status-tool'
import { requestRefundTool } from './refunds-request-tool'

// Central catalog of tools discoverable via ToolSearchProcessor. These tools
// do NOT live in the agent prompt: the model finds them with search_tools and
// they're loaded on demand, so context cost doesn't grow with the catalog.
//
// New tool = one entry here (+ its skill if it needs instructions). The
// Mostro agent's core tools (subscribe, setMyName) stay pinned on the
// agent: the critical path never depends on search.
export const toolRegistry = {
    createInviteTool,
    linkDiscordTool,
    weatherTool,
    getDiapersStatusTool,
    requestDiapersTool,
    getMedsStatusTool,
    requestMedsTool,
    getRefundsStatusTool,
    requestRefundTool,
}
