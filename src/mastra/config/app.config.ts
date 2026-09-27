import z from "zod";

// Normalizes "present but empty" values to undefined. Covers docker-compose
// env_file, which does not strip quotes: `FOO=''` -> `''`.
function emptyToUndefined(value: string): string | undefined {
    const trimmed = value.trim().replace(/^['"]|['"]$/g, '');
    return trimmed.length === 0 ? undefined : trimmed;
}

const envSchema = z.object({
    MONGODB_URI: z.string().min(2),
    MONGODB_DB_NAME: z.string().min(1),
    OPENROUTER_API_KEY: z.string().min(1),
    TELEGRAM_BOT_USERNAME: z.string().min(1),
    TELEGRAM_BOT_TOKEN: z.string().min(1),
    TELEGRAM_WEBHOOK_SECRET_TOKEN: z.string().min(1),
    // Optional secondary channel. All three or none: the adapter throws in its
    // constructor if any is missing, so without all three it is not registered
    // (see mostro-agent.ts).
    DISCORD_BOT_TOKEN: z.string().min(1).optional(),
    DISCORD_APPLICATION_ID: z.string().min(1).optional(),
    DISCORD_PUBLIC_KEY: z.string().min(1).optional(),
    ADMIN_TELEGRAM_ID: z.string().min(1).optional(),
    ADMIN_NAME: z.string().min(1).optional(),
    ADMIN_EMAIL: z.string().min(3).optional(),
    // Enables SimpleAuth for Studio. Meant for prod: lets a local Studio point
    // at prod with an admin token.
    STUDIO_API_KEY: z.string().min(32).optional(),
    // Enables MastraAuthGoogle in Bearer mode: clients (Expo Android/web with
    // PKCE) send the Google id_token in the Authorization header and mostro
    // verifies it against JWKS. Opt-in like STUDIO_API_KEY; without it the
    // provider is not registered.
    GOOGLE_CLIENT_ID: z.string().min(1).optional(),
    // Web session (see web-session-auth.ts): the browser logs in through a
    // Google redirect and keeps a 30-day HttpOnly cookie, so a reload doesn't
    // log it out. Enabled only when all four are set (plus GOOGLE_CLIENT_ID).
    // GOOGLE_COOKIE_PASSWORD signs the cookie. WEB_AUTH_URL is this server's
    // base as the browser sees it (behind the Pages proxy: https://<app>/api);
    // WEB_APP_URL is where the browser lands after login.
    GOOGLE_CLIENT_SECRET: z.string().transform(emptyToUndefined).optional(),
    GOOGLE_COOKIE_PASSWORD: z.string().transform(emptyToUndefined).optional()
        .refine(value => value === undefined || value.length >= 32, 'must be at least 32 chars'),
    WEB_AUTH_URL: z.string().transform(emptyToUndefined).optional(),
    WEB_APP_URL: z.string().transform(emptyToUndefined).optional(),
    // Classifier rule templates as minified JSON. Bootstrap only: ignored if the
    // domain already has an active pointer in Mongo.
    CLASSIFIER_RULES_DIAPERS: z.string().optional(),
    CLASSIFIER_RULES_MEDS: z.string().optional(),
    CLASSIFIER_RULES_REFUNDS: z.string().optional(),
    // Logs to Axiom. If either is missing, logs stay in stdout (dev) / docker
    // logs (prod). Opt-in, same as STUDIO_API_KEY.
    AXIOM_TOKEN: z.string().optional(),
    AXIOM_DATASET: z.string().optional(),
    GMAIL_MAILER_CLIENT_ID: z.string().min(1),
    GMAIL_MAILER_CLIENT_SECRET: z.string().min(1),
    GMAIL_MAILER_REFRESH_TOKEN: z.string().min(1),
    GMAIL_MAILER_SENDER: z.string().min(3),
    PATIENT_NAME: z.string().min(1),
    DELIVERY_ADDRESS: z.string().min(1),
    REQUESTER_NAME: z.string().min(1),
    REQUESTER_PHONE: z.string().min(1),
    DIAPERS_EMAIL_TO: z.string().min(3),
    MEDS_EMAIL_TO: z.string().min(3),
    REFUNDS_EMAIL_TO: z.string().min(3),
    // Docker Compose does not parse quotes in env_file: `NGROK_AUTHTOKEN=''`
    // arrives as the literal string `''` (truthy) and starts ngrok with an
    // invalid token. Any empty/whitespace/quoted-empty value becomes undefined.
    NGROK_AUTHTOKEN: z.string().transform(emptyToUndefined).optional(),
    NGROK_DOMAIN: z.string().transform(emptyToUndefined).optional(),
    // Where the tunnel points: this server. In Docker it is `mostro-server:4111`
    // via the compose hostname; in local dev, `localhost:4111`.
    NGROK_FORWARD_ADDR: z.string().transform(emptyToUndefined).optional(),
    // Extra CORS origins for local dev, comma-separated. The backend already
    // allows the ngrok domain; this adds e.g. the Expo web dev server at
    // http://localhost:8081 without code changes. Empty in prod.
    DEV_CORS_ORIGINS: z
        .string()
        .transform(emptyToUndefined)
        .optional()
        .transform((value) =>
            value
                ? value
                    .split(',')
                    .map((origin) => origin.trim())
                    .filter((origin) => origin.length > 0)
                : []
        ),
    PORT: z.coerce.number().default(4111),
    DUCKDB_PATH: z.string().min(1).default('mastra.duckdb'),
});

export const appConfig = envSchema.parse(process.env);
