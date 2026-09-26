<p align="center">
  <img src="docs/mostro-avatar.jpg" width="120" alt="Mostro logo" />
</p>

<h1 align="center">mostro-server</h1>

<p align="center">
  An AI assistant that handles a family's recurring care errands: diapers, medications and refunds.
</p>

<p align="center">
  <a href="https://github.com/alex-bluetrain/mostro-server/releases"><img src="https://img.shields.io/github/v/release/alex-bluetrain/mostro-server?style=flat-square" alt="Release" /></a>
  <img src="https://img.shields.io/badge/node-%3E%3D22.13-339933?style=flat-square&logo=node.js&logoColor=white" alt="Node" />
  <img src="https://img.shields.io/badge/built%20with-Mastra-000?style=flat-square" alt="Mastra" />
</p>

## Description

A [Mastra](https://mastra.ai) backend with a single supervisor agent that users reach through
Telegram, Discord (optional) or [mostro-app](https://github.com/alex-bluetrain/mostro-app).

- **Orders by email**: workflows send requests to suppliers from Mostro's own Gmail account.
- **Replies resume work**: scheduled polls read the inbox, classify each reply with an LLM, and resume the waiting workflow.
- **Invite-only**: every channel shares one user identity, keyed by Google email.
- **Rich chat**: streams generative UI (AG-UI / OpenUI) to the app.

## Quick start

Requires Node.js ≥ 22.13, pnpm and MongoDB.

```bash
pnpm install
cp .env.example .env   # fill in the required values
pnpm gmail:auth        # one-time: authorize Mostro's Gmail account
pnpm dev               # API + Mastra Studio on http://localhost:4111
```

## Scripts

`pnpm dev`, `pnpm test` and `pnpm typecheck` cover day-to-day work. The full list (seeding, code generation) is in the [guide](docs/GUIDE.md#scripts).

## Documentation

- [Setup & operations guide](docs/GUIDE.md)
- [Identity & invites](docs/identity.md)
- [Inbox pipeline](docs/inbox-pipeline.md)
- [CI/CD](CI-CD.md)

## License

MIT — see [LICENSE](LICENSE).
