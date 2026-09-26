# Classifier rule templates

This is the `.env.example` equivalent for the rules JSON that gets seeded into Mongo. The full format is in [../clasificador.md](../clasificador.md) and the architecture in [../inbox-pipeline.md](../inbox-pipeline.md).

## Usage

1. Copy the domain template to a path **outside the repo**. The filled-in JSON contains sensitive provider data and must not be committed:

   ```bash
   cp docs/classifier-rules/diapers.example.json ~/mostro-secrets/diapers-rules.json
   ```

2. Fill in the `<...>` placeholders:
   - `condition`: a natural-language description the LLM uses to decide whether an email matches.
   - `examples.match` / `examples.no_match`: snippets of real provider emails (few-shot). Add as many as needed.

3. Seed:

   ```bash
   pnpm seed:classifier -- --domain diapers --file ~/mostro-secrets/diapers-rules.json --author "Alex" --changelog "initial seed"
   ```

   Each seed creates a new immutable version and moves the active pointer. The next cron cycle picks up the new rules without a redeploy.

## Automatic bootstrap from env (prod)

The poll needs rules: without them there's nothing to classify. To keep a fresh database from starting in that state, `ensureClassifierSeed()` (`src/mastra/lib/classifier-seed.ts`) runs at boot, next to the admin seed. It does a **seed-if-missing** per domain:

| Domain state | What boot does |
| --- | --- |
| Already has an active pointer | Nothing. It never overwrites what's in Mongo. |
| No pointer + valid `CLASSIFIER_RULES_<DOMAIN>` | Publishes snapshot v1 (`author: boot-seed`). |
| No pointer + env missing or empty | `console.error` warning that the domain won't be processed. |
| No pointer + invalid JSON | `console.error` with details. The process keeps running. |

If a domain still has no rules, the poll **skips** each run with a warning instead of failing. It leaves the mailbox alone, so the emails are still there once rules are loaded. An unconfigured domain doesn't break the other two.

"Never overwrites" is intentional: once there's an admin front end, the DB owns the rules, and a redeploy must not revert their edits. The env var is only for a cold start.

The variables (`CLASSIFIER_RULES_DIAPERS`, `CLASSIFIER_RULES_MEDS`, `CLASSIFIER_RULES_REFUNDS`) are stored in Infisical as **minified** JSON:

```bash
node -e "console.log(JSON.stringify(JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'))))" ~/mostro-secrets/diapers-rules.json
```

To publish new versions for an already-seeded domain, use `pnpm seed:classifier` (or the front end, once it exists). Changing the env var of a domain that already has a pointer has no effect.

## Template rules: what NOT to change

- **`label`**: must match the labels registered in `src/mastra/workflows/<domain>-poll/<domain>-outcome-handlers.ts`. A label without a handler ends as `outcome.completed` and runs nothing.
- **`extract`**: each template's `required` fields are exactly what the handler parses with its Zod resume schema (`workflows/*/schemas/wait-*-resume.schema.ts`). You can **add** extra fields (Zod ignores them), but removing or renaming required ones breaks the resume (`outcome.failed`).
- **`default-outcome`**: the label is free-form (it has no handler). Emails that land here are marked `outcome.review` for manual review.
