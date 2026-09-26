import axiomTransport from '@axiomhq/pino'
import { createCustomTransport } from '@mastra/core/logger'
import { PinoLogger } from '@mastra/loggers'
import { appConfig } from '@config/app.config'

// Server logger. If AXIOM_TOKEN and AXIOM_DATASET are set, logs go to Axiom
// in addition to stdout; if either is missing, nothing changes.
// PinoLogger builds a multistream with the transports + the pretty stream, so
// adding Axiom never takes the logs off the console.
async function createAppLogger(): Promise<PinoLogger> {
    const { AXIOM_TOKEN: token, AXIOM_DATASET: dataset } = appConfig

    if (!token || !dataset) {
        return new PinoLogger({ name: 'Mastra', level: 'info' })
    }

    const stream = await axiomTransport({ token, dataset })

    return new PinoLogger({
        name: 'Mastra',
        level: 'info',
        transports: { axiom: createCustomTransport(stream) },
    })
}

// The boot logger (Mongo connection, seeds, ngrok, /start registration) has
// to exist before the Mastra instance, so it's built here and handed
// to Mastra already constructed. Inside a step or tool use mastra.getLogger(): that one
// is wrapped in a DualLogger that correlates each line with the run's span,
// which this one can't do.
export const appLogger = await createAppLogger()

if (!appConfig.AXIOM_TOKEN || !appConfig.AXIOM_DATASET) {
    appLogger.warn('[axiom] AXIOM_TOKEN/AXIOM_DATASET no seteadas, logs solo a stdout')
}
