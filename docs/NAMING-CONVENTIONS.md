# Naming Conventions

One file per entity (agent, tool, step, schema, type, workflow). Exception: `<domain>.utils.ts` groups cohesive helpers for a domain.

## Philosophy

Names are intentionally verbose. A developer should be able to tell what a file is and what it relates to from its filename alone, without opening it or looking at its directory. The redundancy pays off in:

- Fuzzy file search (VS Code `Ctrl+P`, Telescope `find_files`)
- Less context switching
- Readable Git history and diffs
- Better context for AI-assisted development

Searching `wait-meds` should surface every artifact of that step. Prefer `wait-meds-confirmation-resume.schema.ts` over `resume.schema.ts`.

## Layout

```text
src/mastra/
├── agents/       mostro-supervisor.ts, inbox-classifier-agent.ts
├── tools/        <domain>-<action>-tool.ts
├── scorers/      <domain>-scorer.ts
├── config/       <purpose>.config.ts
├── lib/          <domain>-run.ts and shared helpers
│   ├── inbox-manager/      Gmail gateway (fetch, applyLabel); domain-agnostic
│   ├── mail-classifier/    pure classification/extraction against Mongo rules
│   ├── outcome-processor/  label → handler side effects
│   └── mailer/             outgoing Gmail
├── workflows/
│   ├── <domain>/           one directory per workflow, not per domain
│   │   ├── <domain>.workflow.ts
│   │   ├── schemas/  <thing>.schema.ts
│   │   ├── steps/    <thing>.step.ts
│   │   ├── types/    <thing>.type.ts
│   │   └── utils/    <domain>.utils.ts
│   └── <domain>-poll/      the domain's mailbox poll, its own workflow
│       ├── <domain>-poll.workflow.ts        schedule (cron) + step chain only
│       ├── <domain>-inbox.config.ts
│       ├── <domain>-outcome-handlers.ts
│       └── steps/poll-<domain>-mailbox.step.ts
└── index.ts      central registry: every agent/workflow/scorer is declared here
```

See [inbox-pipeline.md](inbox-pipeline.md) for how the three `lib/` mailbox modules fit together.

## File → export → id

Files are kebab-case with a type suffix. Exports are camelCase (PascalCase for types). Mastra's internal `id` (`createTool` / `createStep` / `createWorkflow` / `new Agent`) is kebab-case and shorter.

| Type            | File                             | Export                      | id                       |
| --------------- | -------------------------------- | --------------------------- | ------------------------ |
| Agent           | `inbox-classifier-agent.ts`      | `inboxClassifierAgent`      | `inbox-classifier-agent` |
| Tool            | `meds-request-tool.ts`           | `requestMedsTool`           | `request-meds`           |
| Step            | `wait-meds-confirmation.step.ts` | `waitMedsConfirmationStep`  | `wait-meds-confirmation` |
| Schema          | `meds-state.schema.ts`           | `medsStateSchema`           | —                        |
| Type            | `meds-state.type.ts`             | `MedsState`                 | —                        |
| Workflow        | `meds.workflow.ts`               | `medsWorkflow`              | `meds-workflow`          |
| Workflow (poll) | `meds-poll.workflow.ts`          | `medsPollWorkflow`          | `meds-poll`              |
| Config          | `app.config.ts`                  | `appConfig`                 | —                        |

In tools the order flips: the file leads with the domain (`meds-request-tool`), the export leads with the action (`requestMedsTool`).

## Other rules

- The supervisor is the naming exception: `mostroSupervisor`, no `Agent` suffix.
- Types are inferred with `z.infer<typeof xSchema>`, with no `Type` suffix on the export.
- A poll workflow doesn't duplicate its main workflow's resume schemas or utils; it imports them from `../<domain>/schemas/...` and `../<domain>/utils/...`.
- Poll steps live in their own file under `steps/`, never inline in `<domain>-poll.workflow.ts`.
- Single quotes and no semicolons in new code; when editing, keep the file's existing style.
- Comments only explain a non-obvious "why", never "what" the code does.
