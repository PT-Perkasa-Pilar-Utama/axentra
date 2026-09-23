# Axentra

Axentra is an internal Document Management System. This repository currently contains
**Axentra Foundation v1.0.0**: the approved engineering base for the Web, API, Worker,
database, queue, storage, observability, documentation, and CI workflow.

Business features from US-01 through US-13 are intentionally not implemented in this
foundation release.

## Delivery Team

| Area                    | Team member(s)                        |
| ----------------------- | ------------------------------------- |
| Tech Lead               | Arya Isnaidi                          |
| Backend                 | Sami                                  |
| Frontend                | Azis, Aiman                           |
| Acceptance verification | Assigned card PIC, with Arya sign-off |

This is an internal delivery team. There is no separate PM or dedicated QA role; card allocation
and acceptance verification are documented in [docs/TASK_BREAKDOWN.md](docs/TASK_BREAKDOWN.md).

---

## Quick Onboard Guide

Prerequisites: Bun 1.3.12, Docker Desktop with Docker Compose, and Git.

### 1. Install dependencies

```powershell
bun install
```

### 2. Create the local environment file

```powershell
Copy-Item .env.example .env
```

Local PostgreSQL uses the standard host port `5432`.

### 3. Start local infrastructure

```powershell
bun run infra:up
```

This starts PostgreSQL, Redis, and MinIO.

### 4. Run database migrations

```powershell
bun run db:migrate
```

Foundation v1.0.0 intentionally has no business tables, so migration generation reports no
schema changes until a reviewed sprint task adds a domain schema.

### 5. Start the application processes

Run each process in a separate terminal:

```powershell
bun run dev:api
bun run dev:worker
bun run dev:web
```

Open:

| Surface       | URL                                         |
| ------------- | ------------------------------------------- |
| Web           | `http://localhost:5173`                     |
| API liveness  | `http://localhost:3001/api/v1/health`       |
| API readiness | `http://localhost:3001/api/v1/health/ready` |
| MinIO console | `http://localhost:9001`                     |

---

## Stack

| Layer    | Technology                                                                     |
| -------- | ------------------------------------------------------------------------------ |
| Runtime  | Bun 1.3.12                                                                     |
| Language | TypeScript strict                                                              |
| Frontend | React, Vite, React Router, TanStack Query, React Hook Form, Zod, Tailwind CSS  |
| API      | Hono REST API on Bun                                                           |
| Worker   | Bun Worker process with BullMQ                                                 |
| Database | PostgreSQL with Drizzle                                                        |
| Queue    | Redis with BullMQ                                                              |
| Storage  | Provider-neutral S3 boundary, local MinIO, production AWS S3-compatible config |
| Logging  | Pino structured logging with credential and content redaction                  |
| Testing  | `bun:test`                                                                     |
| CI       | GitHub Actions quality, unit, build, and integration gates                     |

---

## Repository Structure

```text
axentra/
|-- apps/
|   |-- api/                 Hono API process and HTTP routes
|   |-- web/                 React/Vite web shell
|   `-- worker/              BullMQ worker process
|-- packages/
|   |-- config/              Typed runtime configuration
|   |-- db/                  Drizzle and PostgreSQL boundary
|   |-- observability/       Logging, redaction, request/job correlation
|   |-- queue/               Redis queue contracts and adapters
|   |-- shared/              Browser-safe contracts and schemas
|   `-- storage/             MinIO/AWS S3-compatible storage boundary
|-- docs/                    Architecture, standards, review, and onboarding docs
|-- infra/
|   `-- local/               Local Docker Compose infrastructure
|-- test/                    Cross-package and infrastructure integration tests
|-- .github/workflows/       CI workflow
`-- .husky/                  Local Git hooks
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for dependency rules and package
boundaries.

---

## Developer Workflow

### 1. Start from `dev`

Create task work from the current `dev` branch:

```powershell
git checkout dev
git pull origin dev
git checkout -b <LAYER>-<SPRINT>-<NN>-<Imperative-kebab-title>
```

Normal task PRs target `dev`. Promotion from `dev` to `main` is controlled by Arya Isnaidi
(Tech Lead).

### 2. Implement inside the established boundaries

- Web code may import only browser-safe config exports and shared contracts.
- API and Worker may import infrastructure packages.
- Feature modules should not read environment variables directly.
- Storage code depends on the provider-neutral storage contract, not AWS SDK types.
- Queue jobs carry identifiers and versioned payloads, never document contents.

### 3. Before opening a PR

```powershell
bun run complete-check
```

Self-review with [docs/CODE_REVIEW_CHECKLIST.md](docs/CODE_REVIEW_CHECKLIST.md) before
requesting review.

---

## Common Commands

```powershell
# Local infrastructure
bun run infra:up
bun run infra:down

# Development processes
bun run dev:api
bun run dev:worker
bun run dev:web

# Quality gates
bun run type-check
bun run lint
bun run fmt
bun run test
bun run build
bun run complete-check

# Integration tests, requires local infrastructure
bun run test:integration

# Database
bun run db:generate
bun run db:migrate
```

---

## API Surface

Foundation v1.0.0 exposes only operational health endpoints:

| Method | Path                   | Purpose                                            |
| ------ | ---------------------- | -------------------------------------------------- |
| `GET`  | `/api/v1/health`       | Process liveness without dependency I/O            |
| `GET`  | `/api/v1/health/ready` | Readiness check for PostgreSQL, Redis, and Storage |

Business APIs for authentication, document upload, OCR, AI, search, audit behavior, RBAC, and
domain workflows are excluded until their sprint scope is reviewed and approved.

---

## Documentation

| Document                                                                     | Purpose                                                               |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| [docs/\_index.md](docs/_index.md)                                            | Documentation map                                                     |
| [docs/business/product-overview.md](docs/business/product-overview.md)       | BA product context and approval                                       |
| [docs/business/user-story.md](docs/business/user-story.md)                   | Planned DMS user stories                                              |
| [docs/business/sprint-breakdown.md](docs/business/sprint-breakdown.md)       | Planned delivery sequence                                             |
| [docs/business/acceptance-criteria.md](docs/business/acceptance-criteria.md) | Acceptance criteria index                                             |
| [docs/technical-specs/\_index.md](docs/technical-specs/_index.md)            | Technical specification index                                         |
| [docs/api-specs/\_index.md](docs/api-specs/_index.md)                        | API specification index and endpoint tracker                          |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)                                 | Foundation architecture summary                                       |
| [docs/CODING_STANDARD.md](docs/CODING_STANDARD.md)                           | TypeScript, frontend, backend, config, database, and commit standards |
| [docs/CODE_REVIEW_CHECKLIST.md](docs/CODE_REVIEW_CHECKLIST.md)               | PR self-review checklist                                              |
| [docs/DEVELOPMENT_GUIDE.md](docs/DEVELOPMENT_GUIDE.md)                       | Branch, local workflow, migration, and infrastructure guide           |
| [docs/DEVELOPMENT_SCENARIO_GUIDE.md](docs/DEVELOPMENT_SCENARIO_GUIDE.md)     | Day 1 and task pickup scenarios                                       |
| [docs/ONBOARDING_GUIDE.md](docs/ONBOARDING_GUIDE.md)                         | First-hour onboarding guide                                           |
| [docs/DEPLOYMENT_PLAN.md](docs/DEPLOYMENT_PLAN.md)                           | Deployment plan draft                                                 |
| [docs/E2E_TESTING.md](docs/E2E_TESTING.md)                                   | Future E2E testing guide                                              |
| [docs/GLOSSARY.md](docs/GLOSSARY.md)                                         | Axentra terminology                                                   |
| [docs/TASK_BREAKDOWN.md](docs/TASK_BREAKDOWN.md)                             | Foundation and planned sprint cards                                   |
| [docs/TROUBLESHOOTING_GUIDE.md](docs/TROUBLESHOOTING_GUIDE.md)               | Local troubleshooting runbook                                         |

Business, API, and technical docs may describe planned scope, but implementation remains limited
to Foundation v1.0.0 until the related sprint is approved.

---

## Environments

| Environment | Status                                    |
| ----------- | ----------------------------------------- |
| Local       | Supported through Docker Compose          |
| Test        | To be assigned during deployment planning |
| Production  | To be assigned during deployment planning |

---

## Branch and Release Policy

Axentra uses `dev` as its shared integration and acceptance branch. Work flows through task
branches, `dev`, and `main` production:

| Branch | Purpose                                                                          |
| ------ | -------------------------------------------------------------------------------- |
| `dev`  | Shared integration and internal acceptance branch controlled by Arya (Tech Lead) |
| `main` | Primary production branch controlled by Arya (Tech Lead)                         |

Do not commit generated secrets, `.env`, document contents, signed URLs, or production
credentials.

## License

Proprietary. Internal use only.
