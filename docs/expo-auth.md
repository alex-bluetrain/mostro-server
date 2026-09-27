# Direct Google auth (contract for Expo-style clients)

Mostro accepts a **Google id_token as a Bearer token**, verified against Google's JWKS. This lets clients do the Google sign-in themselves (Expo Android with `@react-native-google-signin/google-signin`, web with Google Identity Services) **without a BFF**.

It coexists with `SimpleAuth` (`STUDIO_API_KEY`, used by Studio): both providers live in the `CompositeAuth` and don't conflict.

## Backend config

Set one env var:

```
GOOGLE_CLIENT_ID=<oauth-client-id>.apps.googleusercontent.com
```

Without it, the provider isn't registered (opt-in, same as `STUDIO_API_KEY`). This mode does **not** need `GOOGLE_CLIENT_SECRET` or `GOOGLE_COOKIE_PASSWORD`; those are only for the web session cookie ([web-session.md](web-session.md)).

## Client contract

1. The client signs in with Google (native Google Sign-In on Android, Google Identity Services on web) and gets an `id_token`. The token's `aud` must match the `GOOGLE_CLIENT_ID` configured on mostro.
2. It sends this header on every request to mostro:

   ```
   Authorization: Bearer <id_token>
   ```

3. Mostro then:
   - verifies the token against Google's JWKS (RS256 signature, `iss`, `aud`, `exp`);
   - applies the **invite gate**: the email must exist in `users` (access is invite-only, not domain-based, so `GOOGLE_ALLOWED_DOMAINS` isn't used);
   - resolves the role (`admin` | `member`) from Mongo by email.

## Token storage on the client

- **Android**: `id_token` in SecureStore (kept out of JS memory).
- **Web**: `id_token` in memory only (a reload means signing in again).

Reference implementation: [mostro-app](https://github.com/alex-bluetrain/mostro-app) (`src/lib/auth-context*.tsx`, `src/lib/token-storage*.ts`).
