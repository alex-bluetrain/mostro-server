# AGENTS.md

## CRITICAL: Never block the session

- **NEVER use `sleep` as a wait step.** It hangs the session and is explicitly blocked. To wait on a process, use the process tools that wait natively (e.g. `get_process_output` with `wait`, or a tool's own timeout).
- **NEVER write potentially infinite loops.** Any polling/wait loop MUST have a bounded number of iterations. No `while [ cond ]; do ... done` without a hard iteration cap.
- **If a tool returns "not allowed" / "blocked", STOP using that pattern immediately.** Do not retry it in a different disguise — change approach.

## CRITICAL: Communication style

Respond in 2 lines max, high-level, no filler. Only expand when explicitly asked. This is inviolable.

## CRITICAL: Load `mastra` skill first

Load the `mastra` skill BEFORE any Mastra work. Never rely on cached knowledge — APIs change between versions.

## Design Principle: KISS

Always prioritize the KISS principle (Keep It Simple, Stupid):

- Prefer direct, explicit code over abstractions. Don't introduce factories, wrappers, or indirection layers unless there's a concrete, current need (not a hypothetical future one).
- The consumer creates what it needs, where it needs it. Avoid IoC-style delegation when a plain instantiation works.
- Fewer layers > more layers. If removing an abstraction makes the code easier to follow without breaking anything, remove it.
- Three similar lines of code are better than a helper used once.

## Rules

- Register all agents, tools, workflows, and scorers in `src/mastra/index.ts`
- Use the `dev` and `build` scripts from `package.json` instead of running `mastra dev` / `mastra build` directly

## Sensitive data

This repo is **public**. Never commit real infra or personal data — use
placeholders:

| Instead of | Use |
| --- | --- |
| The prod domain | `<PROD_DOMAIN>` |
| The VM IP | `<VM_IP>` |
| The deploy path on the VM | `<DEPLOY_DIR>` (in workflows: `secrets.GCP_DEPLOY_DIR`) |
| The GCP project ID | `secrets.GCP_PROJECT_ID` |
| A real person's email | `usuario@example.com` |
| A real name / address | Fictional data (`Ana Pérez`, `Calle Falsa 123`) |

Ground rules:

- **Infra values go in GitHub secrets**, not in the YAML: GitHub masks them as
  `***` in the logs, which are also public.
- **Tests and fixtures use made-up data.** Never copy a real email from a
  provider or data about the person being cared for, not even "just to test".
- **Classifier rules live in `secrets/`** (gitignored) and in Infisical. That
  directory is not tracked.
- `.gitleaks.toml` checks all of this on every PR. If it blocks you with a false
  positive, add the pattern to the rule's allowlist — don't delete the rule or
  put the real value in the config file.

## Resources

- [Mastra Documentation](https://mastra.ai/llms.txt)
- [Skills Discovery](https://mastra.ai/.well-known/skills/index.json)
