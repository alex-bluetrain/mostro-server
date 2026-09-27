import { Mastra } from '@mastra/core/mastra';
import { chatRoute } from '@mastra/ai-sdk';
import { MongoDBStore } from '@mastra/mongodb';
import { DuckDBStore } from "@mastra/duckdb";
import { MastraCompositeStore } from '@mastra/core/storage';
import { Observability, MastraStorageExporter, MastraPlatformExporter, SensitiveDataFilter } from '@mastra/observability';
import { mostroAgent } from './agents/mostro-agent';
import { createTelegramStartHandler } from './lib/telegram-start';
import { toolCallAppropriatenessScorer, completenessScorer, translationScorer } from './scorers/weather-scorer';
import mongoose from 'mongoose';
import { userRepository } from '@business/repositories';
import { startNgrokTunnel } from './ngrok';
import { createServerAuth } from './lib/server-auth';
import { appLogger } from './lib/app-logger';
import { ensureClassifierSeed } from './lib/classifier-seed';
import { appConfig } from './config/app.config';
import { diapersWorkflow } from './workflows/diapers/diapers.workflow';
import { medsWorkflow } from './workflows/meds/meds.workflow';
import { refundsWorkflow } from './workflows/refunds/refunds.workflow';
import { weatherWorkflow } from './workflows/weather/weather.workflow';
import { diapersPollWorkflow } from './workflows/diapers-poll/diapers-poll.workflow';
import { medsPollWorkflow } from './workflows/meds-poll/meds-poll.workflow';
import { refundsPollWorkflow } from './workflows/refunds-poll/refunds-poll.workflow';
import { inboxClassifierAgent } from './agents/inbox-classifier-agent';
import { webThreadMiddleware } from './lib/web-thread';
import { meRoute, updateMyPreferencesRoute } from './routes/me.route';
import { workflowsOverviewRoute } from './routes/workflows-overview.route';
import { createInviteRoute, listInvitesRoute } from './routes/invites.route';
import {
    listClassifierRulesRoute,
    getClassifierSnapshotRoute,
    publishClassifierSnapshotRoute,
    activateClassifierVersionRoute,
} from './routes/classifier-rules.route';
import { agUIRoute } from './routes/ag-ui.route';
import { googleCallbackRoute, googleLoginRoute, logoutRoute } from './routes/auth.route';
import { sessionRenewalMiddleware } from './lib/web-session-auth';

const ngrokOrigin = appConfig.NGROK_DOMAIN ? `https://${appConfig.NGROK_DOMAIN}` : undefined;
const corsOrigins = [ngrokOrigin, ...appConfig.DEV_CORS_ORIGINS].filter(
    (origin): origin is string => Boolean(origin)
);

// Connect to MongoDB
await mongoose.connect(appConfig.MONGODB_URI, {
    dbName: appConfig.MONGODB_DB_NAME,
});

// ngrok is only for local dev: in production (VM + Caddy) there is no authtoken.
// The tunnel exposes this backend (NGROK_FORWARD_ADDR, e.g. localhost:4111) so
// Telegram can deliver webhooks to it; without NGROK_FORWARD_ADDR it is skipped.
if (appConfig.NGROK_AUTHTOKEN) {
    await startNgrokTunnel();
}

// Seed admin user
if (appConfig.ADMIN_EMAIL) {
    await userRepository.ensureAdminSeed(
        appConfig.ADMIN_EMAIL,
        appConfig.ADMIN_NAME ?? 'Admin',
        appConfig.ADMIN_TELEGRAM_ID
    );
} else {
    appLogger.warn('[mastra] ADMIN_EMAIL not set, skipping admin seed');
}

// Classifier rules are a precondition for the polls: if the pointer is missing,
// the bootstrap publishes it from env (or warns loudly) here, not 15 min later in the cron.
await ensureClassifierSeed();

export const mastra = new Mastra({
    server: {
        auth: createServerAuth(),
        cors: corsOrigins.length
            ? {
                origin: corsOrigins,
                credentials: true,
            }
            : undefined,
        middleware: [sessionRenewalMiddleware],
        // Exposes every agent in AI SDK format (Assistant UI protocol). Not used
        // by mostro-app (which uses the AG-UI/OpenUI route); kept for now.
        apiRoutes: [
            {
                ...chatRoute({
                    path: '/chat/:agentId',
                    version: 'v6',
                }),
                middleware: webThreadMiddleware,
            },
            agUIRoute,
            googleLoginRoute,
            googleCallbackRoute,
            logoutRoute,
            meRoute,
            updateMyPreferencesRoute,
            workflowsOverviewRoute,
            listInvitesRoute,
            createInviteRoute,
            listClassifierRulesRoute,
            activateClassifierVersionRoute,
            getClassifierSnapshotRoute,
            publishClassifierSnapshotRoute,
        ],
    },
    workflows: {
        weatherWorkflow, diapersWorkflow, medsWorkflow, refundsWorkflow,
        diapersPollWorkflow, medsPollWorkflow, refundsPollWorkflow,
    },
    agents: { mostroAgent, inboxClassifier: inboxClassifierAgent },
    // The weather scorers stay registered to run by hand from the playground,
    // but are no longer attached to an agent: the weather agent was folded into
    // the Mostro agent, and attaching them there would score every message (from
    // any domain) against weather expectations.
    scorers: { toolCallAppropriatenessScorer, completenessScorer, translationScorer },
    storage: new MastraCompositeStore({
        id: 'composite-storage',
        default: new MongoDBStore({
            id: "mastra-storage",
            uri: appConfig.MONGODB_URI,
            dbName: appConfig.MONGODB_DB_NAME,
        }),
        domains: {
            observability: await new DuckDBStore({ path: appConfig.DUCKDB_PATH }).getStore('observability'),
        }
    }),
    logger: appLogger,
    observability: new Observability({
        configs: {
            default: {
                serviceName: 'mastra',
                exporters: [
                    new MastraStorageExporter(), // Persists observability events to Mastra Storage
                    // new MastraPlatformExporter(), // Sends observability events to Mastra Platform (if MASTRA_PLATFORM_ACCESS_TOKEN is set)
                ],
                spanOutputProcessors: [
                    new SensitiveDataFilter(), // Redacts sensitive data like passwords, tokens, keys
                ],
            },
        },
    }),
});

// The Telegram adapter routes /start (bot_command) to the Chat SDK slash-command
// pipeline, so invite redemption is registered here, not in the onDirectMessage
// gate. initialize() is idempotent: it awaits the initialization addAgent
// already started and guarantees sdk is available.
const mostroChannels = mostroAgent.getChannels();
if (mostroChannels) {
    try {
        await mostroChannels.initialize(mastra);
        mostroChannels.sdk?.onSlashCommand('/start', createTelegramStartHandler());
        appLogger.info('[telegram-start] /start handler registered');
    } catch (err) {
        appLogger.error('[telegram-start] channel init failed; /start handler not registered', { err });
    }
} else {
    appLogger.warn('[telegram-start] agent has no channels; /start handler not registered');
}
