# CI/CD

How this repo's GitHub Actions pipelines work: what each workflow does, why it is designed that way, and what to watch out for when touching them.

Files involved:

| File | Role |
|---|---|
| [`.github/workflows/ci.yml`](.github/workflows/ci.yml) | Quality checks (secret scan, typecheck, tests, Docker build without push) |
| [`.github/workflows/release.yml`](.github/workflows/release.yml) | Versioning with release-please + image publish to GHCR |
| [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) | Manual deploy to the GCP VM |
| [`release-please-config.json`](release-please-config.json) / [`.release-please-manifest.json`](.release-please-manifest.json) | release-please config and state |
| [`Dockerfile`](Dockerfile) | The image that gets published and deployed |

---

## 1. Overview and architecture

### The full flow

```
   PR opened                 push to main                    Release PR merged
       │                          │                                  │
       ▼                          ▼                                  ▼
  ┌─────────┐              ┌─────────────┐                    ┌─────────────────────┐
  │ ci.yml  │              │ release.yml │                    │ release.yml         │
  │ secrets │              │  release-please ──► opens/       │  release-please     │
  │ checks  │              └─────────────┘      updates       │   └ tags vX.Y.Z     │
  │ docker  │                                   Release PR    │  checks (reuses ci) │
  └─────────┘                                                 │   └ publish ──► GHCR│
                                                              └─────────────────────┘
                                                                     │
                                                    (a human decides) ▼
                                                              ┌─────────────┐
                                                              │ deploy.yml  │
                                                              │ (manual)    │──► GCP VM
                                                              └─────────────┘
```

### Design decisions

**1. Releases via release-please + Conventional Commits.**
Commits to `main` follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, etc.). release-please accumulates them in a "Release PR" that it keeps open and up to date. When a human merges that PR, the `vX.Y.Z` tag, GitHub Release and CHANGELOG are created. Only then is a Docker image published. Versioning is automatic and auditable, but the decision to cut a release stays human.

**2. Images are published only on releases, not on every push.**
GHCR only receives images for `vX.Y.Z` tags (plus `latest`). No per-commit or per-branch images. This keeps the registry simple and guarantees that everything in GHCR is deployable and traceable to a release.

**3. Deploys are 100% manual and pinned to an immutable tag.**
`deploy.yml` only runs via `workflow_dispatch` and requires typing the tag by hand (no default, on purpose). Deploy and rollback are the same operation: run the workflow with a different tag. Nothing deploys automatically on merge.

**4. CI runs on PRs and on release — not on every push to main.**
`ci.yml` has no `push` trigger: checks run on the PR (before merge) and `release.yml` re-invokes them via `workflow_call` only when a release is created, to gate the publish. A normal push to `main` only runs release-please (seconds). Accepted trade-off: a direct push to `main` without a PR isn't tested until the next release.

**5. No application secrets in the pipeline.**
The deploy only writes `IMAGE_TAG` to the VM's `.env`. Real secrets (API keys, connection strings) are resolved by the Infisical CLI **inside the container** at startup, authenticating with the VM's identity (GCP ID token). The pipeline never sees or carries app secrets.

**6. Authentication without static credentials.**
- GitHub → GCP: Workload Identity Federation (`id-token: write`), no service-account JSON keys.
- GitHub → GHCR: the workflow's own ephemeral `GITHUB_TOKEN`.
- Container → Infisical: GCP ID token from the VM's metadata server.

There are no long-lived credentials to rotate.

---

## 2. The workflows in detail

### 2.1 `ci.yml` — CI

**When it runs:** on every pull request, and when `release.yml` invokes it (`workflow_call`) as a release is created. Deliberately has **no** `push` trigger of its own (see decision 4).

**Concurrency:** `cancel-in-progress: true` — pushing again to the same PR cancels the previous run. Right for CI: the old run no longer adds anything.

**Jobs (run in parallel):**

#### `secrets` — Gitleaks
Runs gitleaks with [`.gitleaks.toml`](.gitleaks.toml) over the full history: blocks the PR if a secret or real infra/personal data shows up (the repo is public). False positives go into the rule's allowlist; rules are never deleted.

#### `checks` — Typecheck + unit tests
1. Starts MongoDB 7 as a service container on `localhost:27017` (tests use it; `tests/setup-env.ts` defaults `MONGODB_URI` to that address).
2. `pnpm/action-setup@v4` without an explicit version: reads the pnpm version from `packageManager` in `package.json` (single source of truth).
3. `pnpm install --frozen-lockfile` — fails if the lockfile is out of sync.
4. `pnpm typecheck` (`tsc --noEmit`).
5. `vitest run` **excluding** `*.integration.test.ts`: those tests hit a real LLM via `OPENROUTER_API_KEY` and are flaky/costly, so they don't gate the pipeline. Note: passing `--exclude` overrides vitest's default exclude, which is why `node_modules` is excluded explicitly.

#### `docker` — Docker build (no push)
Verifies the `Dockerfile` builds, without publishing anything. Catches build breakages (system deps, `mastra build`, etc.) before merge.

No `type=gha` cache on purpose: exporting the `pnpm install` layer (~1.2GB) costs more time than it saves, and the `mastra build` layer is invalidated on every commit anyway.

---

### 2.2 `release.yml` — Release

**When it runs:** on every push to `main` (including the merge of the Release PR itself).

**Permissions:** `contents: write` (tags/releases), `pull-requests: write` (the Release PR), `packages: write` (push to GHCR).

**Concurrency:** group `release` without `cancel-in-progress`: a half-finished release is never cancelled.

**Jobs (chained: `release-please` → `checks` → `publish`):**

#### `release-please`
Runs `googleapis/release-please-action@v4` with the repo config. Two behaviors depending on the push:
- **Normal push:** opens or updates the Release PR with the accumulated conventional commits. Publishes nothing and the other jobs are skipped — the run takes seconds.
- **Release PR merge:** creates the `vX.Y.Z` tag + GitHub Release + CHANGELOG, and exposes `release_created=true` and `tag_name` as outputs.

⚠️ Requires the repo setting **"Allow GitHub Actions to create and approve pull requests"** (Settings → Actions → General). The workflow `permissions` alone are not enough.

The config (`release-please-config.json`) is minimal: a single package (`.`), `release-type: node` (versions `package.json`), tags without a component (`v1.2.0`, not `mostro-v1.2.0`). The manifest (`.release-please-manifest.json`) stores the last released version.

#### `checks`
Reuses the whole `ci.yml` via `uses: ./.github/workflows/ci.yml`. Only runs if `release_created == 'true'`: validates the actual state of `main` right before publishing. Gates the publish: nothing reaches GHCR with a red typecheck or tests.

#### `publish`
Only runs if `release_created == 'true'` **and** `checks` passed. Builds the image and pushes it to GHCR with two tags:
- `vX.Y.Z` — **immutable**; this is what gets deployed and rolled back to.
- `latest` — exists only for the `docker compose pull` in the VM's startup script on first boot.

The GHCR login uses the workflow's own `GITHUB_TOKEN`: zero credentials to manage.

At the end it writes the image name and deploy instructions to the step summary.

---

### 2.3 `deploy.yml` — Deploy

**When it runs:** manually only (`workflow_dispatch`) with a required `version` input (e.g. `v1.2.0`). **No default on purpose:** rollback depends on immutable tags, and a `latest` default would make "open the form and hit enter" take a non-reproducible path.

**Permissions:** `id-token: write` (WIF to GCP), `packages: read` (query the manifest in GHCR).

**Concurrency:** group `deploy-prod`, `cancel-in-progress: false`. One deploy at a time; cancelling one halfway would leave the VM in an undefined state — they queue, they don't cancel.

**Steps:**

1. **Auth to GCP** via Workload Identity Federation (`google-github-actions/auth@v2`) — no static keys.
2. **Verify the tag exists in GHCR** with `docker manifest inspect` (queries the registry without pulling the image). *Fail-fast*: if the tag doesn't exist, the workflow fails here and the VM is never touched.
3. **Update the VM** over SSH through an IAP tunnel (the VM needs no public IP or open port 22):
   - Writes `IMAGE_TAG=vX.Y.Z` to the `.env` in the deploy directory (the only thing that travels — see decision 5).
   - `docker compose pull && docker compose up -d --remove-orphans`.
4. **Health gate:** polls `docker inspect .State.Health.Status` of the `mostro-app-1` container every 15s, up to 20 attempts (~5 min). If it never reaches `healthy`, the workflow fails red — a broken deploy never shows green.

**Rollback:** run this same workflow with the previous tag. There is no separate mechanism.

---

## 3. Pitfalls and possible improvements

### Pitfalls

- **The health check doesn't roll back.** If the app never reaches `healthy`, the workflow goes red but the VM keeps running the broken version (or a restarting container). Rollback is manual: run Deploy with the previous tag. Acceptable for this project, but worth knowing.
- **Inconsistency window if publish fails.** The `vX.Y.Z` tag and GitHub Release are created in the `release-please` job, but the image is pushed in `publish`. If `checks` or `publish` fail, a release exists **without an image**. The check in `deploy.yml` protects you (fails fast), but the fix is re-running the failed workflow from the Actions UI, which isn't obvious to newcomers.
- **`checks` gates the publish, not the tag.** The tag already exists when `checks` runs (`needs: release-please`). So there can be tags/releases whose image never existed. Same remedy as above.
- **Direct pushes to `main` aren't tested.** Checks run on PRs and on release — a commit pushed straight to `main` doesn't go through CI until the next release. Work through PRs; to enforce it, enable branch protection with required status checks.
- **Breakages on `main` are detected late.** Two PRs that are green on their own can break when combined (semantic conflict), and that only surfaces in the release's `checks`. Not serious — the release fails and you fix it — but the diagnosis arrives days after the merge that caused it.
- **Integration tests never run in CI.** `*.integration.test.ts` (real LLM) is excluded and nothing in the pipeline runs it, not even nightly — if they break, you find out locally or in prod.
- **`latest` is mutable.** Only the first-boot startup script uses it; deploying `latest` by hand on the VM loses reproducibility. Don't use `latest` for anything else.
- **Single VM, downtime on every deploy.** `docker compose up -d` recreates the container: a few seconds of outage. No replicas or blue-green. Accepted for a family bot; don't scale this setup to anything with an SLA without rethinking it.
- **Infra values live in GitHub Secrets** (`GCP_WIF_PROVIDER`, `GCP_CI_SERVICE_ACCOUNT`, `GCP_PROJECT_ID`, `GCP_VM_NAME`, `GCP_ZONE`, `GCP_DEPLOY_DIR`). They aren't credentials, but if they change (VM recreated, GCP project changed) the workflows fail in non-obvious ways. Document their origin in the infra runbook.

### Possible improvements (by value/effort)

1. **Branch protection on `main`** (require PR + required status checks). Closes the untested-direct-push hole without adding CI runs.
2. **Nightly (scheduled) job for the integration tests**, with `continue-on-error` or in a separate workflow that gates nothing. Today they are dead code from the pipeline's point of view.
3. **A GitHub Environment (`production`) on the deploy job.** Free even on personal private repos: deploy history in the UI, and optionally *required reviewers* as an extra approval.
4. **Post-deploy notification** (Telegram, since the project is already a Telegram bot): deploy success/failure with the tag. Closes the loop without opening GitHub.
5. **`docker/metadata-action` for image tags** if extra tags (sha, major/minor) are ever needed. With two fixed tags it's unnecessary today — KISS.
6. **Digest-pin third-party actions** (`actions/checkout@<sha>` instead of `@v4`) if the repo becomes more sensitive. Risk is low today and the maintenance cost is real; evaluate with Dependabot/Renovate.

### What NOT to change (deliberate decisions)

- **Don't add a `push` trigger to `ci.yml`** — it duplicates runs (see the comment in the file).
- **Don't add a default to deploy's `version` input** — it breaks the reproducibility guarantee.
- **Don't enable `cancel-in-progress` on deploy/release** — cutting halfway leaves inconsistent state.
- **Don't add a `type=gha` cache to the Docker build** — already measured: it costs more than it saves.
