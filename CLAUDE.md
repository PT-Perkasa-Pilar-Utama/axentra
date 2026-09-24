# AI Agent Instructions: Axentra

> **Critical:** These rules apply to every task. If context is compacted, re-read this file before
> continuing. Do not mark work complete until the relevant verification has passed. For a normal
> repository change, run `bun run complete-check`.

> **Source of truth:** Product scope and acceptance criteria live in `docs/business/`; API contracts
> in `docs/api-specs/`; architecture and data rules in `docs/technical-specs/`; assigned work in
> `docs/TASK_BREAKDOWN.md`; implementation rules in `docs/CODING_STANDARD.md`; operational guidance
> in `docs/DEVELOPMENT_SCENARIO_GUIDE.md`, `docs/E2E_TESTING.md`, and
> `docs/TROUBLESHOOTING_GUIDE.md`.

## Project Overview

**Axentra** is an internal Document Management System (DMS). The repository currently delivers
**Foundation v0.1.0**: engineering infrastructure and a platform-status surface. The BA flows
US-01 through US-13 are documented and planned; they are not implemented unless an assigned sprint
card explicitly brings them into scope.

| Layer         | Technology                                                                    |
| ------------- | ----------------------------------------------------------------------------- |
| Runtime       | Bun 1.3.12                                                                    |
| Language      | TypeScript with strict compiler settings                                      |
| Web           | React, Vite, React Router, TanStack Query, React Hook Form, Zod, Tailwind CSS |
| API           | Hono                                                                          |
| Worker        | BullMQ                                                                        |
| Data          | Drizzle ORM, PostgreSQL, Redis                                                |
| Storage       | MinIO locally; S3-compatible storage in hosted environments                   |
| Observability | Pino, redaction, correlation helpers                                          |

## Team and Work Model

This is an internal delivery team. There is no separate PM or dedicated QA role.

| Area                    | Team member(s)           | Responsibility                                                           |
| ----------------------- | ------------------------ | ------------------------------------------------------------------------ |
| Tech Lead               | Arya Isnaidi             | Architecture, review, PR/release approval, and acceptance sign-off       |
| Backend                 | Sami                     | Assigned API, database, worker, storage, and security cards              |
| Frontend                | Azis, Aiman              | Assigned Web UI, presenter, and API-integration cards                    |
| Acceptance verification | Assigned card PIC + Arya | AC evidence and final sign-off; this is an activity, not a separate role |

1. Work only on a pre-assigned card in `docs/TASK_BREAKDOWN.md` unless the Tech Lead explicitly
   changes the scope.
2. Developers do not self-pick backlog work.
3. Backend and Frontend can work in parallel only from the documented API contract.
4. Do not fake persistence, authorization, processing, or audit behavior in the Web UI.
5. The `QA-...` card prefix means acceptance-verification work. It does not imply a dedicated QA
   team or change the card's assigned PIC.

## Local Skills and Commands

This repository is self-guided for a developer or agent that starts with no personal skill library.
Before taking implementation, review, debug, or refactor action, match the task to the local
resources below.

1. Read the matching `.claude/skills/<skill>/SKILL.md` completely before using that skill.
2. Read the matching `.claude/commands/<command>.md` before following its workflow.
3. Use the smallest set of resources that covers the task. If multiple skills apply, use the more
   specific one first.
4. Local skills and commands supplement this file; they never override `CLAUDE.md`, assigned task
   scope, or the authoritative Axentra documentation.
5. When a copied skill contains Terral, Next.js, SPK, voucher, or other foreign-project details,
   ignore those details and follow Axentra's Hono, React/Vite, BullMQ, and `docs/` contracts.

| Task                                    | Use first                             | Also consult when needed                                             |
| --------------------------------------- | ------------------------------------- | -------------------------------------------------------------------- |
| Start any developer task                | `.claude/commands/start-task.md`      | `codebase-navigation`, relevant `docs/`                              |
| Navigate architecture or trace an issue | `codebase-navigation`                 | `.claude/commands/explore-codebase.md`                               |
| Diagnose a bug                          | `.claude/commands/debug-issue.md`     | `codebase-navigation`, `docs/TROUBLESHOOTING_GUIDE.md`               |
| Build a Web feature                     | `add-frontend-feature`                | `design-taste-frontend`, `impeccable`, `emil-design-eng`             |
| Design or substantially improve Web UI  | `design-taste-frontend`               | `high-end-visual-design`, `impeccable`, `redesign-existing-projects` |
| Review animation or interaction motion  | `review-animations`                   | `emil-design-eng`                                                    |
| Add an API endpoint                     | `add-api-endpoint`                    | `add-audit-log`, `add-shared-schema`                                 |
| Change database schema                  | `add-drizzle-migration`               | `add-audit-log`, `docs/CODING_STANDARD.md`                           |
| Add a cross-process contract            | `add-shared-schema`                   | relevant API and technical specs                                     |
| Add an acceptance E2E flow              | `add-maestro-flow`                    | `docs/E2E_TESTING.md`                                                |
| Refactor safely                         | `refactor-large-file`                 | `.claude/commands/refactor-safely.md`                                |
| Review a change set                     | `developer-pre-pr-checklist`          | `.claude/commands/review-changes.md`                                 |
| Prepare a commit                        | `git-commit`                          | `.claude/commands/commit-and-push.md`                                |
| Push a branch                           | `.claude/commands/commit-and-push.md` | `git-commit`                                                         |
| Improve prose or documentation          | `stop-slop`                           | `docs/CODING_STANDARD.md`                                            |

If no resource fits, use the standard Axentra workflow: read the linked docs, inspect the smallest
relevant code path, make a scoped change, and run the appropriate verification.

## Repository Layout

```text
axentra/
|-- apps/
|   |-- api/                 Hono API process
|   |-- web/                 React/Vite Web application
|   `-- worker/              BullMQ Worker process
|-- packages/
|   |-- config/              Typed runtime configuration
|   |-- db/                  Drizzle and PostgreSQL boundary
|   |-- observability/       Logging, redaction, correlation helpers
|   |-- queue/               Redis and BullMQ boundary
|   |-- shared/              Browser-safe contracts and Zod schemas
|   `-- storage/             MinIO/S3-compatible boundary
|-- docs/                    Business, API, technical, and operational docs
|-- infra/local/             Local Docker Compose infrastructure
|-- test/                    Integration tests
|-- .github/workflows/       CI workflows
`-- .husky/                  Git hooks
```

## Architecture Laws

### Boundaries

- API modules live under `apps/api/src/modules/<module>/`.
- New business modules use `<module>.routes.ts`, `.handler.ts`, `.service.ts`, `.repository.ts`,
  `.schema.ts`, and `.test.ts` where applicable.
- Web features use API -> Presenter -> View under `apps/web/src/features/<feature>/`:

  ```text
  <feature>.api.ts
  <feature>.presenter.ts
  <feature>.view.tsx
  ```

- Handlers validate HTTP input, call one service, and return the standard response envelope. They
  do not contain business logic or direct Drizzle calls.
- Services own business rules and transaction boundaries. Repositories own Drizzle queries.
- Domain code uses `StorageAdapter` and the queue boundary; it does not couple itself to a storage
  vendor or put raw document content in job payloads.
- Web views do not call `fetch` directly and do not implement authorization as a substitute for the
  API. Server-side authorization is mandatory.
- Use `@axentra/shared` for browser-safe contracts only. Do not expose server-only types, secrets,
  object keys, or credentials to the Web application.

### Scope and Domain Rules

- Business UI copy is Bahasa Indonesia. Code identifiers, error codes, database names, and API
  fields are English.
- The business personas are `member_team` and `head_of_team`, as documented in
  `docs/technical-specs/09-authentication.md`.
- Product behavior must match the linked BA acceptance criteria. Do not invent product roles,
  endpoints, requirements, or third-party provider behavior.
- OCR/AI and hosted infrastructure integrations remain behind an internal interface until an
  approved provider and card exist.
- Foundation v0.1.0 contains no business tables or partial mock business workflows.

### Code Quality

- Keep production files under 300 lines; split proactively at 250 lines.
- Use strict TypeScript: no `any`, no `@ts-ignore`, no non-null assertions, and no unsafe casts.
- Exported functions require explicit return types.
- Prefer `unknown` with validation/narrowing. Zod is the runtime validation source of truth.
- Use string literal unions or Zod enums, never TypeScript `enum`.
- Do not read `Bun.env` or `process.env` in feature or business modules. Use `@axentra/config`;
  config loaders, migration config, CLIs, and tests are the narrow exceptions.
- No dead code, unused imports, secrets, absolute local paths, document contents, signed URLs, or
  object keys in committed code or logs.
- `TODO` must carry its blocking task ID, following `docs/CODING_STANDARD.md`; do not leave
  untracked placeholders.

## Database, Storage, and Security

- Change schemas through committed Drizzle migrations only. Never alter a shared database manually.
- Rebase before `bun run db:generate`; generate a logical migration once per ready PR; then validate
  it on a clean local database with `bun run db:migrate`.
- Keep applied shared migrations immutable. Use a forward fix instead.
- Multi-table mutations, category-permission changes, and download authorization/audit writes must
  be transactional when the BA scope is implemented.
- Object keys are generated and validated server-side. Signed URL TTLs are bounded.
- Queue payloads contain identifiers and versioned metadata, never raw document contents.
- Never log credentials, document contents, signed URLs, or sensitive object-storage data.

## Testing and Verification

Run the full gate before requesting review or declaring a normal implementation task complete:

```powershell
bun run complete-check
```

Equivalent individual gates:

```powershell
bun run type-check
bun run lint
bun run fmt
bun run test
bun run build
```

For changed infrastructure boundaries, also run:

```powershell
bun run infra:up
bun run db:migrate
bun run test:integration
```

- Do not claim an AC, E2E flow, deployment, or integration is passed without current evidence.
- Acceptance evidence records the environment, role/test account, input data, expected result,
  observed result, and failure screenshots/logs where relevant.
- If a dependency is not implemented or available, mark the check **Blocked**, not **Pass**.

## Development Workflow

Before editing, run the workflow in `.claude/commands/start-task.md`. Do not jump from a raw
developer request directly into implementation.

The first response for a new task must summarize the request, relevant docs/ACs, current branch,
remote/upstream freshness, dirty files, intended PIC, branch name, dependencies, planned files, and
verification plan. For Frontend requests, inspect any supplied Figma link or screenshot first.

Before editing:

1. Read the assigned card and every linked business, API, and technical document.
2. Search for and read similar implementations before introducing a new pattern.
3. Reuse existing utilities, shared schemas, config, and boundaries instead of duplicating them.
4. Confirm whether the change needs tests, docs, migrations, infrastructure, or acceptance evidence.

Branch names:

```text
BE-S1-01-Implement-auth-prerequisite
FE-S2-05-Build-related-documents-section
DB-S1-01-Create-document-core-schema
FND-07-Add-quality-gates
QA-S1-01-Verify-upload-duplicate-flow
```

Use `<CARD-ID>-<Imperative-kebab-title>` exactly. The Card ID is `BE-S1-…`, `FE-S1-…`, `DB-S1-…`,
`QA-S1-…`, or `FND-…` as defined in `docs/TASK_BREAKDOWN.md`. Do not add `feature/`, `fix/`, or
another prefix unless the repository owner explicitly changes this convention.

- `dev` is the shared integration branch for internal acceptance; there is no separate `test` branch.
- Normal task PRs target `dev`.
- `main` is the primary protected branch. Arya Isnaidi promotes `dev` to `main` after acceptance.
- Do not push directly to `dev` or `main`.
- Use Conventional Commits: `<type>(<scope>): <subject>`; include the task ID when applicable.
- Do not add `Co-Authored-By` trailers automatically.
- Arya Isnaidi (Tech Lead) is the approving reviewer. Developers self-review with
  `docs/CODE_REVIEW_CHECKLIST.md` before requesting review.

### Commit and Push Safety Gate

When a developer asks an AI to commit or push, the AI must read and follow
`.claude/commands/commit-and-push.md` before taking the requested Git action.

- A commit request authorizes only an explicit, scoped local commit after pre-commit checks.
- A push request authorizes only a normal push after remote and divergence checks.
- The AI must stop for failed verification, a conflict, a branch behind its base/upstream, uncertain
  changes, a suspected secret, missing remote setup, or a rejected push.
- The AI must not use `git add -A`, `git add .`, `git push --force`, `git push --force-with-lease`,
  or a direct push to `dev` or `main`.
- The AI must not silently rebase, merge, resolve a conflict, discard work, or overwrite another
  developer's changes. It reports the evidence and asks for a decision.

## Local Commands

```powershell
bun install
bun run infra:up
bun run db:migrate
bun run dev:web
bun run dev:api
bun run dev:worker

bun run type-check
bun run lint
bun run fmt
bun run test
bun run build
bun run complete-check

bun run db:generate
bun run test:integration
bun run infra:down
```

Local PostgreSQL is exposed on port `5432`. The full environment and recovery procedures are in
`docs/ONBOARDING_GUIDE.md`, `docs/DEPLOYMENT_PLAN.md`, and `docs/TROUBLESHOOTING_GUIDE.md`.

## Context Recovery Checklist

If context is compacted, re-confirm:

- [ ] This is **Axentra**, not another project; use Hono API + React/Vite Web + BullMQ Worker.
- [ ] Foundation v0.1.0 is infrastructure-first. Do not quietly implement unassigned BA features.
- [ ] The authoritative contract is in `docs/`, not an assumed UI, endpoint, role, or schema.
- [ ] Team allocation is Arya/Sami for Backend and Azis/Aiman for Frontend; no separate PM or QA.
- [ ] Each card has a PIC; acceptance verification is evidence by the PIC and sign-off by Arya.
- [ ] Authorization, download permission, audit behavior, and persistence must exist server-side.
- [ ] Use Bun commands and the repository's `bun run` scripts.
- [ ] Run the relevant verification before making a completion claim.
