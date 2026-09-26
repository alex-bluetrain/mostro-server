// One-time script: gets the refresh token for Mostro's Gmail account.
// Usage: pnpm run gmail:auth
import http from 'node:http'
import { auth } from '@googleapis/gmail'

// Own port, not Mastra's (PORT/4111): this runs as a separate process and would clash with the
// server if it were up. The callback can't be a Mastra route either, because
// GMAIL_MAILER_REFRESH_TOKEN is required to boot the server: you'd need the token to
// start the thing that gives you the token. The number is arbitrary; it only has to match
// the redirect URI registered on the OAuth client.
const PORT = 53682
// 127.0.0.1 and not localhost: on Windows localhost resolves to ::1 first, and the server listens
// on IPv4 only, so the browser would hit connection refused when coming back from consent.
const REDIRECT_URI = `http://127.0.0.1:${PORT}/oauth2callback`
// modify allows reading and labelling on top of sending, which is what the poller needs.
// Gmail has no label-scoped scopes: this covers the whole mailbox, and containment
// lives in the code (fixed per-sender query, predefined resume functions).
const SCOPES = [
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/gmail.send',
]

const clientId = process.env.GMAIL_MAILER_CLIENT_ID
const clientSecret = process.env.GMAIL_MAILER_CLIENT_SECRET

if (!clientId || !clientSecret) {
    console.error('Missing GMAIL_MAILER_CLIENT_ID and/or GMAIL_MAILER_CLIENT_SECRET in .env')
    process.exit(1)
}

const oauth2 = new auth.OAuth2(clientId, clientSecret, REDIRECT_URI)

// prompt: 'consent' forces Google to return a refresh token even if the account
// already authorized the app before.
const authUrl = oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
})

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`)

    if (url.pathname !== '/oauth2callback') {
        res.writeHead(404)
        res.end()
        return
    }

    const code = url.searchParams.get('code')
    const error = url.searchParams.get('error')

    if (!code) {
        res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' })
        res.end('Faltó el parámetro code.')

        if (error) {
            console.error(`\nGoogle rejected the request: ${error}`)
        } else {
            console.error('\nNo authorization code received.')
        }
        server.close()
        return
    }

    try {
        const { tokens } = await oauth2.getToken(code)
        res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' })
        res.end('Listo. Volvé a la terminal.')

        if (tokens.refresh_token) {
            console.log('\nPaste this into your .env:\n')
            console.log(`GMAIL_MAILER_REFRESH_TOKEN=${tokens.refresh_token}`)
        } else {
            console.error('\nGoogle returned no refresh token. Revoke the app\'s access at')
            console.error('https://myaccount.google.com/permissions and run the script again.')
        }
    } catch (error) {
        res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
        res.end('Falló el intercambio del code.')
        console.error(error)
    } finally {
        server.close()
    }
})

// Loopback only: the authorization code must not be reachable over the LAN.
server.listen(PORT, '127.0.0.1', () => {
    console.log('Open this URL with Mostro\'s Gmail account:\n')
    console.log(authUrl)
    console.log('\nEsperando el callback...')
})
