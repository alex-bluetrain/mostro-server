# Studio against production

How to get into Mastra Studio on the production server (`https://<PROD_DOMAIN>`), the licensing problem that came with third-party auth, and the solution we shipped.

**TL;DR**: go to `https://<PROD_DOMAIN>/` and log in with the `STUDIO_API_KEY` as the password (the email is ignored).

Two pieces make this work:

1. **SimpleAuth** (turned on by the `STUDIO_API_KEY` env var): Studio's login UI with a third-party provider is gated behind an Enterprise Edition license, and `SimpleAuth` is **exempt** from that gate.
2. **Studio served from the same origin as the API** (`mastra build --studio`): the session cookie is `SameSite=Lax` and the browser won't send it cross-site, so a local Studio pointed at prod got stuck in a login loop.

---

## 1. The problem: third-party auth + Studio in prod requires an EE license

Studio decides which login UI to show by calling `GET /api/auth/capabilities`. The response is built by `buildCapabilities()` in `@mastra/core`, which applies this gate:

```js
const isLicensedOrCloud = hasLicense || isCloud || isSimple || isDev;
// ...
if (implementsInterface(auth, "getCurrentUser") && isLicensedOrCloud) {
  user = await auth.getCurrentUser(request);
}
```

The request's user is **only resolved** if one of these holds:

| Condition | With an SSO provider in prod |
|---|---|
| `hasLicense`: valid EE license | ❌ we don't have one |
| `isCloud`: deployed on Mastra Cloud | ❌ our own VM |
| `isSimple`: provider is `SimpleAuth` | ✅ **the solution we shipped** |
| `isDev`: `NODE_ENV != production` | ❌ not in prod |

With an SSO provider in prod, capabilities returned `{"enabled":true,"login":null}` even with a valid Bearer, and Studio showed "no login method configured". This is intentional: the official docs (`docs-studio-auth.md` in `@mastra/core`) say Studio Auth with third-party providers in production requires an EE license, **but it's free in dev and with SimpleAuth**. `SimpleAuth` carries the `isSimpleAuth = true` marker precisely to exempt it from the gate.

The gate only covers the **login UI**: `hasSSO` requires the provider to implement `getLoginUrl`, and `hasCredentials` requires `signIn`. `MastraAuthGoogle` without a `clientSecret` runs in bearer mode: it exposes no login UI and only validates the `id_token`, so composing it doesn't touch the license.

## 2. The solution: Google bearer + SimpleAuth for Studio

`createServerAuth()` (`src/mastra/lib/server-auth.ts`) builds a `CompositeAuth` with two entries, both bearer-token based and neither gated by the license:

- **`MastraAuthGoogle`** in bearer mode (`GOOGLE_CLIENT_ID`) → end users, who come in through mostro-app. The client does the Google login (PKCE) and sends the `id_token`, which is validated here against Google's JWKS. A valid token isn't enough: `authorizeUser` requires the email to exist in `users`, so access is still invite-only.
- **`SimpleAuth`** (`STUDIO_API_KEY`, in prod via Infisical) → Studio, with a single token that maps to a static admin. Minimum 32 chars. `SimpleAuth` supports multiple users; we declare only one because Studio is the only consumer today. If you add entries, watch out for two things: `authorizeUser()` accepts any token in the map for everything (no per-route or per-role permissions), and the map is built in the constructor, so adding or revoking one means a restart.

`CompositeAuth` tries providers in order and the first one that authenticates wins. Google goes first because every user request takes that path. With only one secret configured, that provider is used directly without composing. With none, boot **fails**: a server without auth is a config bug, and it's better for it to hurt at startup than on the first request.

The Telegram webhook's public regex (`TELEGRAM_CHANNEL_WEBHOOK`, exported from `server-auth.ts`) is passed to **both** providers. `CompositeAuth` merges every provider's `public` list, and that endpoint has its own protection via `TELEGRAM_WEBHOOK_SECRET_TOKEN`. If the auth middleware blocked it, the bot would stop receiving updates.

## 3. Connecting to prod

Studio is served **from the prod server itself**, at the domain root:

```text
https://<PROD_DOMAIN>/
```

Use the regular login form: any email (it's ignored) and the `STUDIO_API_KEY` as the password. There's nothing to run locally, no key in the URL, and no `localStorage` tweaking.

This is enabled by the `--studio` flag on `mastra build`, which adds the frontend to the output (`.mastra/output/studio`, ~11 MB). The server serves it if it finds the `MASTRA_STUDIO_PATH` env var. Both are set in the `Dockerfile`:

```dockerfile
RUN pnpm build --studio
ENV MASTRA_STUDIO_PATH=/app/studio
```

### 3.1. Why the same origin is what makes login work

`SimpleAuth.signIn()` issues the session as a cookie with `SameSite=Lax` (hardcoded in `@mastra/core`). With `Lax`, the browser stores the cookie but **doesn't resend it on cross-site requests**.

A local Studio (`localhost:3000`) pointed at prod (`<PROD_DOMAIN>`) counts as two different sites. Sign-in returned 200, but the next request went out without the credential, got a 401, and looped back to login. It wasn't CORS or a misconfiguration; it's a browser rule.

Serving Studio from the same origin as the API means the request is no longer cross-site, and `Lax` sends the cookie normally. **Nothing about auth changed**: the cookie is still `HttpOnly; SameSite=Lax` (verified). What changed is the origin the request comes from.

### 3.2. Direct API access

```bash
curl -H "Authorization: Bearer <STUDIO_API_KEY>" https://<PROD_DOMAIN>/api/agents
```

⚠️ Studio against prod is the real thing: it runs real tools (sends Gmail emails), writes to the prod MongoDB, spends API tokens, and shows real Telegram threads.

## 4. Setting up the key in prod

1. Generate it: `node -e "console.log('sk-' + require('crypto').randomBytes(32).toString('hex'))"`
2. Add `STUDIO_API_KEY` in Infisical (mostro project, prod environment).
3. Restart the container on the VM so it picks up the secret: `docker compose up -d --force-recreate app`

To rotate it, change the value in Infisical and restart. Active sessions are invalidated on their own (the cookie *is* the key, and it stops validating).

## 5. Security considerations

Serving Studio in prod puts an admin console on the internet. Mitigations and accepted risks:

- **The console sits behind the auth gate**: without the key, `/` only shows the login. Every `/api/*` endpoint requires a credential, except the Telegram webhook (which has its own secret token).
- **The key travels over HTTPS** (Caddy with a Let's Encrypt cert) and lives in an `HttpOnly` cookie, invisible to JavaScript.
- **`STUDIO_API_KEY` is a single shared credential**, with no users and no per-person revocation: whoever has it has full access. It's the admin key, not the user key. Users come in through mostro-app with their own Google account, each with their own identity and subject to the allowlist.
- **The image grows by ~11 MB** from the frontend assets.

## 6. Rejected alternatives (and why)

| Approach | Why not |
|---|---|
| EE license | The official path for third-party SSO in prod, but the cost isn't justified for a personal project |
| `CompositeAuth` with an SSO provider | Technically passes the gate, but "unlocks" third-party login UI in prod without a license, which is the licensing gray area we want to avoid. Composing with Google in bearer mode doesn't fall into this: it adds no login UI (see §2) |
| `MASTRA_DEV=true` in prod | Bypasses the license gate, a direct violation of EE licensing |
| Patching the cookie to `SameSite=None` | Requires string-patching a `@mastra/core` internal (breaks silently if the format changes) and gives up the CSRF protection `Lax` provides |
| `auth_header` in the URL / headers in `localStorage` | Worked, but the key ends up in browser history and in plain text in `localStorage`; the Settings panel is also behind the auth gate itself |
| SSH tunnel | Port 4111 isn't exposed to the VM host (only to the docker-compose network) |
| Google Bearer + `auth_header` | The API accepted the token, but capabilities didn't resolve the user because of the EE gate, leaving Studio unusable |
| Google SSO (cookie) as the API provider | Requires third-party login UI (EE gate). Google is used in bearer mode instead: the client does the login and Mostro only verifies the `id_token` + allowlist |

## 7. References

- Bundled official docs: `node_modules/@mastra/core/dist/docs/references/docs-studio-auth.md` (SimpleAuth quickstart and "EE licensing" section)
- Studio deployment and the `--studio` flag: `node_modules/@mastra/core/dist/docs/references/docs-studio-deployment.md`
- SimpleAuth: `node_modules/@mastra/core/dist/docs/references/docs-server-auth-simple-auth.md`
- License gate: `buildCapabilities()` and `isSimpleAuth()` in `@mastra/core` (`dist/chunk-*.js`)
