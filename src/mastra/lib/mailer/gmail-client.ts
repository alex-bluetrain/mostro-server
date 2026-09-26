import { auth, gmail } from '@googleapis/gmail'
import { appConfig } from '@config/app.config'

let client: ReturnType<typeof gmail> | undefined

// Shared between the mailer (send) and the reader (read and label): a single
// refresh token, a single client. The SDK renews the access token on its own.
export function getGmailClient() {
    if (!client) {
        const oauth2 = new auth.OAuth2(appConfig.GMAIL_MAILER_CLIENT_ID, appConfig.GMAIL_MAILER_CLIENT_SECRET)
        oauth2.setCredentials({ refresh_token: appConfig.GMAIL_MAILER_REFRESH_TOKEN })
        client = gmail({ version: 'v1', auth: oauth2 })
    }
    return client
}
