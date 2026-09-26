import { Agent } from '@mastra/core/agent';
import type { RequestContext } from '@mastra/core/request-context';
import { Memory } from '@mastra/memory';
import { OPENUI_SYSTEM_PROMPT } from '../generated/openui-system-prompt';
import { CHANNEL_KEY } from '@lib/web-thread';
import { createTelegramAdapter } from '@chat-adapter/telegram';
import { createDiscordAdapter } from '@chat-adapter/discord';
import { appConfig } from '../config/app.config';
import { ToolSearchProcessor } from '@mastra/core/processors';
import { createChannelGate } from '@lib/channel-gate';
import { createResolveResourceId } from '@lib/resolve-resource-id';
import { isRequestAdmin } from '@lib/request-identity';
import { setMyNameTool } from '@tools/set-my-name-tool';
import { subscribeTool } from '@tools/subscribe-tool';
import { toolRegistry } from '@tools/registry';
import { supervisorSkillsResolver } from '../skills/skills-resolver';

export const MOSTRO_SUPERVISOR_INSTRUCTIONS = `You are Mostro, an assistant that helps the family coordinate recurring orders and updates about the patient.

How to handle requests:
1. For notification subscriptions ("avisame cuando...", "quiero que me avisen"), use subscribeTool. See Notifications below.
2. For diapers, medications/prescriptions or refunds (status, ordering/requesting): load the matching skill (diapers / meds / refunds) and follow it. These are shared monthly flows, not private to one person.
3. For weather questions or activity planning based on weather: load the weather skill and search for the weather tool.
4. For anything else, check your skills/tool catalog first (search_tools); if nothing matches, respond directly if you can, or let the user know it's not supported yet.

Notifications:
- There is ONE subscription per person, covering every update about the patient (diaper deliveries, medication orders and refunds). It is not per-topic: you cannot subscribe someone to only one of them.
- When a user asks to be notified about anything in these flows, call subscribeTool directly — no skill or search needed.
- When you confirm it, make the scope explicit: from now on they get every update about the patient, not just the topic they asked about.
- Subscribing twice is harmless (it is idempotent), so if someone asks again just confirm they are already subscribed.

User management:
- New users receive a fixed welcome message outside your pipeline that may ask for their name. If a user introduces themselves or states their name, save it with setMyNameTool.
- You can invite new users and link Discord accounts, but those capabilities are not pinned: search for them (search_tools / skills) when someone asks to invite a person or to chat via Discord. If the search finds nothing, the capability is not available for this user — decline gracefully without inventing an alternative.
- If a user asks to change their name, use setMyNameTool.
- If a shared-order tool or workflow reports that an order was not registered because the user's name is missing (reason 'requester_unidentified'), ask the user for their name, save it with setMyNameTool, then retry the order.
- If a shared-order flow reports that a send failed (reason 'send_failed'), the order was NOT placed. Do not retry it — just relay the message to the user as-is; they can ask again later.

Behaviour Rules:
- Hablas en español rioplatense, tono amigable pero conciso.

CRITICAL RULE: when a notification signal arrives (system-generated context, not authored by the user), limit yourself to relaying its content to the user. Never call a tool, load a skill, or resume a workflow in response to a notification signal — those signals only inform, they do not request an action.
`;

// The former per-domain sub-agents (meds/diapers/refunds, now skills) injected
// the date to scope orders by month. That was lost when they became skills: the
// supervisor needs today's date to resolve "the March order" or "this month".
function todayHeader(): string {
    const now = new Date();
    return `Today is ${now.toISOString().slice(0, 10)} (YYYY-MM-DD). The current month scope is ${now.toISOString().slice(0, 7)} (YYYY-MM). Use this month unless the user names a different one.`;
}

// The web renders OpenUI Lang; Telegram only understands text. The OpenUI
// prompt requires the WHOLE answer to be openui-lang, so sending it to Telegram
// would break its messages: it is added only when the channel is web (set by
// web-thread.ts, the browser's only entry point).
//
// The "Channel: web" block below only covers what OPENUI_SYSTEM_PROMPT leaves
// ambiguous. Do not repeat rules the generated prompt already has (that the
// whole answer is openui-lang, or the component list): those are regenerated
// by `pnpm generate:openui-prompt`.
export function supervisorInstructions({ requestContext }: { requestContext: RequestContext }): string {
    if (requestContext.get(CHANNEL_KEY) !== 'web') return `${todayHeader()}\n\n${MOSTRO_SUPERVISOR_INSTRUCTIONS}`;

    return `${OPENUI_SYSTEM_PROMPT}

---

${todayHeader()}

${MOSTRO_SUPERVISOR_INSTRUCTIONS}

Channel: web (OpenUI)
- TextContent soporta markdown, pero usalo sólo inline (negritas, itálicas), nunca para estructura: una tabla va en Table(Col(...)), una lista de opciones en ListBlock(ListItem(...)) y un título en CardHeader. Una tabla markdown adentro de un TextContent se ve rota.
- Las skills que cargues están escritas en markdown: de ahí tomá SOLO las reglas de negocio, nunca el formato. Aunque acabes de leer una skill, tu respuesta sigue siendo openui-lang: datos tabulares van en Table(Col(...)), jamás en pipes (|) dentro de un TextContent.
- Si en el historial hay respuestas tuyas en texto plano, ignoralas como ejemplo de formato: la próxima respuesta igual va en openui-lang.
- NO emitas texto antes ni entre tool calls ("un momento", "déjame buscar"): todo texto que emitas se concatena al código y rompe el parser. Llamá las tools en silencio y emití texto una sola vez, al final, empezando directo con root = Card(...).`;
}

export const mostroSupervisorModel = 'openrouter/deepseek/deepseek-v4-flash';

export const discordEnabled = Boolean(
    appConfig.DISCORD_BOT_TOKEN && appConfig.DISCORD_APPLICATION_ID && appConfig.DISCORD_PUBLIC_KEY
);

export const mostroSupervisor = new Agent({
    id: 'mostro-supervisor',
    name: 'Mostro',
    instructions: supervisorInstructions,
    model: mostroSupervisorModel,
    // Only the core tools are pinned: subscribe (critical notification rule) and
    // setMyName. The rest live in the catalog and are discovered via
    // search_tools (see tools/registry.ts).
    tools: { setMyNameTool, subscribeTool },
    skills: supervisorSkillsResolver,
    inputProcessors: [
        new ToolSearchProcessor({
            tools: toolRegistry,
            // autoLoad collapses search→load→use into search→use: one call
            // fewer per discovery. Low topK because every match gets activated.
            search: { topK: 3, minScore: 0.15, autoLoad: true },
            // Permissions in code, not in prose: a tool hidden by the filter
            // does not even show up in search results. The user lookup is
            // cached per RequestContext (the hook runs per candidate).
            filter: async ({ toolName, requestContext }) => {
                if (toolName === 'create-invite') return isRequestAdmin(requestContext);
                return true;
            },
        }),
    ],
    memory: new Memory(),
    channels: {
        adapters: {
            telegram: {
                adapter: createTelegramAdapter(),
                streaming: true,
                toolDisplay: 'hidden', // suppress tool call messages
            },
            // Optional secondary channel: treated like Telegram (plain text, no
            // openui-lang) because only web-thread.ts sets CHANNEL_KEY.
            // createDiscordAdapter() throws if credentials are missing, so
            // without them the channel does not exist.
            ...(discordEnabled
                ? {
                      discord: {
                          adapter: createDiscordAdapter(),
                          streaming: true,
                          toolDisplay: 'hidden' as const,
                      },
                  }
                : {}),
        },
        // Canonical memory: every thread is owned by the user's email (never
        // telegram:<id> or discord:<id>), so both channels share memory. Runs
        // only when a thread is created; if the author does not resolve to a
        // user, it throws (see resolve-resource-id.ts).
        resolveResourceId: createResolveResourceId(),
        // The access gate must cover all three entry paths (DM, mention, subscription)
        // to reject unknown senders everywhere.
        handlers: {
            onDirectMessage: createChannelGate(),
            onMention: createChannelGate(),
            onSubscribedMessage: createChannelGate(),
        },
    },
});
