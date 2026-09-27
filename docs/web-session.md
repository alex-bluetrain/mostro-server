# Web session (cookie)

The browser has no safe place to keep a Google id_token across reloads, so the
web app does not hold one. The server runs the Google login and hands the
browser a signed HttpOnly cookie. Android keeps using Bearer id_tokens
([expo-auth.md](expo-auth.md)); the Studio key is unchanged.

## Flow

1. The app sends the browser to `GET /auth/google/login`. The server sets a
   short-lived signed `state` cookie and redirects to Google.
2. Google redirects back to `GET /auth/google/callback?code&state`. The server
   checks `state`, trades the code for an id_token (with the client secret),
   applies the invite gate and sets `mostro_session`.
3. Every API call from the web app uses `credentials: 'include'`.
   `WebSessionAuth` (`src/mastra/lib/web-session-auth.ts`) accepts the cookie,
   re-checks the invite gate and scopes memory to the email.
4. `POST /auth/logout` clears the cookie.

Errors on the callback redirect back to the app with `?login_error=<code>`
(`invalid_state`, `google`, `not_invited`).

## Cookie

`mostro_session`: HMAC-signed `{ email, exp }` (`GOOGLE_COOKIE_PASSWORD`),
`HttpOnly; SameSite=Lax; Path=/`, `Secure` over https, 30 days. Sliding
renewal: once past half its life, any successful request gets a fresh one.
We use our own cookie instead of `@mastra/auth-google`'s SSO mode because
that one dies with the id_token (~1h) and `/auth/sso/*` counts as an EE
feature in production.

## Same origin (required)

Safari and Firefox block third-party cookies, so the browser must see the
server on the app's own origin. The app's Cloudflare Pages Function
(`mostro-app/functions/api/[[path]].ts`) proxies `https://<PROD_DOMAIN>/api/*`
to the server; the app's `MOSTRO_SERVER_URL` is `https://<PROD_DOMAIN>/api`.

## Config

| Var | Value |
| --- | --- |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Web OAuth client |
| `GOOGLE_COOKIE_PASSWORD` | >= 32 random chars |
| `WEB_AUTH_URL` | `https://<PROD_DOMAIN>/api` |
| `WEB_APP_URL` | `https://<PROD_DOMAIN>` |

Add `https://<PROD_DOMAIN>/api/auth/google/callback` as an authorized redirect
URI on the Google OAuth client. If any var is missing, the feature is off and
the routes answer 404.
