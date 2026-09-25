# Onboarding Guide

## Axentra: Document Management System

**Version:** 1.0.0<br>
**Date:** 2026-09-16  
**Author:** Arya Isnaidi (Tech Lead)  
**Status:** Living Document

For new developers joining Axentra. Read this before writing code.

Axentra is currently at **Foundation v1.0.0**. The repository contains the approved engineering
base for Web, API, Worker, database boundary, queue, storage, observability, CI, and documentation.
Business features from US-01 through US-13 are planned but intentionally not implemented in the
foundation release.

---

## Table of Contents

1. [Project Context](#1-project-context)
2. [Prerequisites](#2-prerequisites)
3. [Local Development Setup](#3-local-development-setup)
4. [Codebase Walkthrough](#4-codebase-walkthrough)
5. [Development Workflow](#5-development-workflow)
6. [Key Concepts to Understand](#6-key-concepts-to-understand)
7. [Environments](#7-environments)
8. [Where to Get Help](#8-where-to-get-help)
9. [Day-1 Anti-Patterns](#9-day-1-anti-patterns)

---

## 1. Project Context

Axentra is an internal Document Management System. The product allows teams to upload documents,
prevent duplicate knowledge items, extract metadata, generate Smart Tags and categories, search
documents, preview and download files, audit downloads, and manage category-based download
permissions.

BA personas:

| Persona      | Purpose                                                                                   |
| ------------ | ----------------------------------------------------------------------------------------- |
| Member Team  | Uploads documents, searches, previews, and downloads documents when permission allows it. |
| Head of Team | Views analytics, audits download activity, and manages category download permissions.     |

Current stack:

| Layer         | Technology                                                                    |
| ------------- | ----------------------------------------------------------------------------- |
| Runtime       | Bun 1.3.12                                                                    |
| Language      | TypeScript strict                                                             |
| Web           | React, Vite, React Router, TanStack Query, React Hook Form, Zod, Tailwind CSS |
| API           | Hono REST API on Bun                                                          |
| Worker        | Bun Worker process with BullMQ                                                |
| Database      | PostgreSQL with Drizzle                                                       |
| Queue         | Redis with BullMQ                                                             |
| Object store  | Provider-neutral S3 boundary, local MinIO                                     |
| Logging       | Pino structured logging with redaction                                        |
| Testing       | `bun:test`                                                                    |
| CI            | GitHub Actions quality, unit, build, and integration gates                    |
| Documentation | Markdown under `docs/`                                                        |

Read order:

1. [GLOSSARY.md](GLOSSARY.md).
2. [business/product-overview.md](business/product-overview.md).
3. [business/user-story.md](business/user-story.md) and
   [business/sprint-breakdown.md](business/sprint-breakdown.md).
4. [business/acceptance-criteria.md](business/acceptance-criteria.md).
5. [technical-specs/\_index.md](technical-specs/_index.md).
6. [api-specs/\_index.md](api-specs/_index.md).
7. [CODING_STANDARD.md](CODING_STANDARD.md).
8. [TASK_BREAKDOWN.md](TASK_BREAKDOWN.md) to find assigned cards.

---

## 2. Prerequisites

| Tool           | Required | Notes                                                        |
| -------------- | -------- | ------------------------------------------------------------ |
| Bun            | Yes      | Use the version in `package.json`.                           |
| Docker Desktop | Yes      | Required for PostgreSQL, Redis, and MinIO.                   |
| Git            | Yes      | Use correctly named task branches from `dev`.                |
| VS Code        | Optional | Recommended editor.                                          |
| PowerShell     | Yes      | Commands in this repo are documented for Windows PowerShell. |

Recommended VS Code extensions:

- `ms-vscode.vscode-typescript-next`
- `bradlc.vscode-tailwindcss`
- `ms-azuretools.vscode-docker`

Recommended editor settings:

```json
{
  "editor.formatOnSave": true,
  "typescript.tsdk": "node_modules/typescript/lib"
}
```

Windows notes:

- Docker Desktop must be running before `bun run infra:up`.
- Local PostgreSQL uses the standard host port `5432`.
  `5432`.
- Do not commit `.env`.

---

## 3. Local Development Setup

### 3.1 Install dependencies

From repository root:

```powershell
bun install
```

### 3.2 Create local environment file

```powershell
Copy-Item .env.example .env
```

Review the generated `.env` before starting services. Local values should point to:

| Dependency | Local value                    |
| ---------- | ------------------------------ |
| PostgreSQL | `localhost:5432`               |
| Redis      | `localhost:6379`               |
| MinIO API  | `http://localhost:9000`        |
| Web API    | `http://localhost:3001/api/v1` |

### 3.3 Start local infrastructure

```powershell
bun run infra:up
```

This starts:

- PostgreSQL.
- Redis.
- MinIO.

### 3.4 Run migrations

```powershell
bun run db:migrate
```

Foundation v1.0.0 intentionally has no business tables. Business schema appears only after a
reviewed sprint task adds it.

### 3.5 Inspect the local database

With local PostgreSQL running and `DATABASE_URL` set in `.env`, start Drizzle Studio from the
repository root:

```powershell
bun run db:studio
```

Open the local address printed in the terminal. Studio binds to `127.0.0.1` and is not exposed to
other machines on the network. Keep the terminal running while you use Studio and press `Ctrl+C` to
stop it. Studio connects to the database configured by `DATABASE_URL`; confirm that it points to
your local database before editing any data.

### 3.6 Start app processes

Run each process in a separate terminal:

```powershell
bun run dev:api
```

```powershell
bun run dev:worker
```

```powershell
bun run dev:web
```

Open:

| Surface       | URL                                         |
| ------------- | ------------------------------------------- |
| Web           | `http://localhost:5173`                     |
| API liveness  | `http://localhost:3001/api/v1/health`       |
| API readiness | `http://localhost:3001/api/v1/health/ready` |
| MinIO console | `http://localhost:9001`                     |

### 3.7 Run the checks

Baseline gate:

```powershell
bun run complete-check
```

Integration test gate:

```powershell
bun run infra:up
bun run test:integration
```

All checks must pass before a PR requests review.

---

## 4. Codebase Walkthrough

Repository map:

| Directory or file        | What lives here                                      |
| ------------------------ | ---------------------------------------------------- |
| `apps/web`               | React/Vite Web shell, routes, features, API clients. |
| `apps/api`               | Hono API process, middleware, handlers, modules.     |
| `apps/worker`            | BullMQ worker process and job handlers.              |
| `packages/config`        | Typed runtime configuration.                         |
| `packages/db`            | Drizzle and PostgreSQL boundary.                     |
| `packages/storage`       | S3-compatible storage contract and adapters.         |
| `packages/queue`         | Redis/BullMQ queue contracts and adapters.           |
| `packages/observability` | Logging, redaction, correlation helpers.             |
| `packages/shared`        | Browser-safe contracts and schemas.                  |
| `infra/local`            | Docker Compose local infrastructure.                 |
| `test`                   | Cross-package integration tests.                     |
| `docs`                   | Product, API, technical, and operational docs.       |

Trace an API request:

```text
apps/api/src/app.ts
  -> apps/api/src/modules/<module>/<module>.routes.ts
    -> apps/api/src/modules/<module>/<module>.handler.ts
      -> apps/api/src/modules/<module>/<module>.service.ts
        -> packages/db or packages/storage or packages/queue
```

Trace a frontend interaction:

```text
apps/web/src/features/<feature>/<feature>.view.tsx
  -> apps/web/src/features/<feature>/<feature>.presenter.ts
    -> apps/web/src/features/<feature>/<feature>.api.ts
      -> apps/web/src/lib/api-client.ts
        -> /api/v1/...
```

Trace background work:

```text
API service
  -> packages/queue
    -> Redis
      -> apps/worker
        -> packages/db / packages/storage / packages/observability
```

Current implemented foundation modules:

| Module          | Location                                | Purpose                          |
| --------------- | --------------------------------------- | -------------------------------- |
| Health API      | `apps/api/src/modules/health`           | Liveness and readiness checks.   |
| Platform Status | `apps/web/src/features/platform-status` | Web surface for API readiness.   |
| Queue           | `packages/queue`                        | BullMQ boundary.                 |
| Storage         | `packages/storage`                      | MinIO/S3-compatible abstraction. |
| Config          | `packages/config`                       | Runtime config validation.       |

---

## 5. Development Workflow

Your cards are pre-assigned in [TASK_BREAKDOWN.md](TASK_BREAKDOWN.md). Do not pick random backlog
items.

### 5.1 Create a branch

Start from current `dev`:

```powershell
git checkout dev
git pull origin dev
git checkout -b <LAYER>-<SPRINT>-<NN>-<Imperative-kebab-title>
```

Examples:

```text
BE-S1-02-Implement-document-upload-api
FE-S1-01-Build-member-upload-dashboard
QA-S1-01-Verify-upload-duplicate-flow
BE-S1-04-Implement-duplicate-detection
```

### 5.2 Before coding

Read:

- The assigned row in [TASK_BREAKDOWN.md](TASK_BREAKDOWN.md).
- The linked acceptance criteria under `docs/business/acceptance-criteria-breakdown/`.
- The relevant API spec under `docs/api-specs/`.
- The relevant technical spec under `docs/technical-specs/`.
- [CODING_STANDARD.md](CODING_STANDARD.md).

Confirm:

- The task is inside approved scope.
- The API contract is clear.
- The data model impact is understood.
- Server-side authorization and audit implications are understood.
- Tests and docs updates are identified.

### 5.3 Implement inside established boundaries

Rules:

- Web code imports only browser-safe config and shared contracts.
- API and Worker may import server-only infrastructure packages.
- Feature modules do not read environment variables directly.
- Storage logic goes through `packages/storage`.
- Queue jobs carry identifiers and versioned payloads, not document contents.
- Download permission is enforced in the API, not only in Web UI.
- Sensitive data, document contents, credentials, object keys, and signed URLs are not logged.

### 5.4 Verify

Run:

```powershell
bun run type-check
bun test
bun run lint
bun run fmt
bun run build
```

Or the full gate:

```powershell
bun run complete-check
```

If local infrastructure is part of the change:

```powershell
bun run test:integration
```

### 5.5 Open a PR

Normal task PRs target `dev`.

PR description must include:

- Task ID.
- Sprint.
- User Story ID.
- Acceptance Criteria IDs.
- Docs changed.
- Verification commands.
- Screenshots or logs when UI/infra behavior changed.
- Any contract deviation.

Arya Isnaidi's Tech Lead review is required before merge. See
[DEVELOPMENT_SCENARIO_GUIDE.md](DEVELOPMENT_SCENARIO_GUIDE.md) for step-by-step examples.

---

## 6. Key Concepts to Understand

| Concept                          | Where to read                                                                            |
| -------------------------------- | ---------------------------------------------------------------------------------------- |
| Axentra terminology              | [GLOSSARY.md](GLOSSARY.md)                                                               |
| Product scope                    | [business/product-overview.md](business/product-overview.md)                             |
| User stories                     | [business/user-story.md](business/user-story.md)                                         |
| Acceptance criteria              | [business/acceptance-criteria.md](business/acceptance-criteria.md)                       |
| API conventions                  | [api-specs/01-conventions.md](api-specs/01-conventions.md)                               |
| Documents API                    | [api-specs/03-documents.md](api-specs/03-documents.md)                                   |
| Processing API                   | [api-specs/04-processing.md](api-specs/04-processing.md)                                 |
| Search, tags, categories         | [api-specs/05-search-tags-categories.md](api-specs/05-search-tags-categories.md)         |
| Audit and permissions            | [api-specs/07-audit-permissions.md](api-specs/07-audit-permissions.md)                   |
| Repository structure             | [technical-specs/03-repository-structure.md](technical-specs/03-repository-structure.md) |
| Module definitions               | [technical-specs/05-module-definitions.md](technical-specs/05-module-definitions.md)     |
| Data model rules                 | [technical-specs/06-data-model.md](technical-specs/06-data-model.md)                     |
| Authentication and authorization | [technical-specs/09-authentication.md](technical-specs/09-authentication.md)             |
| Integration points               | [technical-specs/10-integration-points.md](technical-specs/10-integration-points.md)     |
| Development scenarios            | [DEVELOPMENT_SCENARIO_GUIDE.md](DEVELOPMENT_SCENARIO_GUIDE.md)                           |
| PR review checklist              | [CODE_REVIEW_CHECKLIST.md](CODE_REVIEW_CHECKLIST.md)                                     |

---

## 7. Environments

| Environment | URL                     | Status                               | PIC                      |
| ----------- | ----------------------- | ------------------------------------ | ------------------------ |
| Local       | `http://localhost:5173` | Supported through Docker Compose     | Card PIC                 |
| Test        | To be assigned          | Deployment planning required         | Arya Isnaidi (Tech Lead) |
| Production  | To be assigned          | Not available until release approval | Arya Isnaidi (Tech Lead) |

You do not deploy directly from task branches. Promotion flow is:

```text
task branch -> PR to dev -> dev -> main
```

Deployment rules live in [DEPLOYMENT_PLAN.md](DEPLOYMENT_PLAN.md).

---

## 8. Where to Get Help

Use this order:

1. The docs, starting from [docs/\_index.md](_index.md).
2. [TROUBLESHOOTING_GUIDE.md](TROUBLESHOOTING_GUIDE.md) for known local failure modes.
3. [DEVELOPMENT_SCENARIO_GUIDE.md](DEVELOPMENT_SCENARIO_GUIDE.md) for task pickup examples.
4. Arya Isnaidi (Tech Lead), with file path, line number, command output, and what you already tried.
5. Peer developer.

When asking for help, include:

- Branch name.
- Task ID.
- Command that failed.
- Full error snippet.
- Whether Docker Desktop is running.
- Whether `.env` was created from `.env.example`.

---

## 9. Day-1 Anti-Patterns

Avoid these:

- Starting work before reading the assigned docs.
- Implementing business features outside the approved sprint card.
- Copying logic, roles, routes, or terms from another project into Axentra.
- Adding dependencies such as `axios`, `jest`, `vitest`, `redux`, `zustand`, or Prisma without Tech
  Lead approval.
- Reading `process.env` directly inside feature or business modules.
- Logging document contents, credentials, object keys, tokens, or signed URLs.
- Committing `.env`, generated secrets, local uploads, or fixture data containing real client
  documents.
- Faking frontend success states without API-backed persistence.
- Enforcing download permission only in the Web UI.
- Marking E2E or AC coverage as passed without actual evidence.
- Skipping `bun run complete-check` before PR review.
