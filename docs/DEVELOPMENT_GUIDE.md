# Development Guide

## Branch Workflow

Create task work from current `dev`:

```text
BE-S1-01-Implement-auth-prerequisite
FE-S2-05-Build-related-documents-section
DB-S1-01-Create-document-core-schema
FND-07-Add-quality-gates
QA-S1-01-Verify-upload-duplicate-flow
```

Normal task PRs target `dev`. Promotion to `main` is controlled by Arya Isnaidi (Tech Lead). Squash
merge is preferred, and direct pushes to protected branches are prohibited.

## Local Workflow

1. Copy `.env.example` to `.env`.
2. Install with `bun install`.
3. Start infrastructure with `bun run infra:up`.
4. Apply migrations with `bun run db:migrate`.
5. Run API, Worker, and Web in separate terminals.
6. Add focused tests with the change.
7. Run `bun run complete-check` before opening a PR.

## Environment Responsibility

Web receives only `VITE_*` browser-safe values. API and Worker load validated server
configuration. Do not read environment variables in feature or business modules.

## Migration Workflow

Rebase on the target branch, update the relevant schema, generate one logical migration, inspect
the SQL, apply it to a clean database, and document operational impact in the PR. Applied shared
migrations are immutable; use a forward fix.

Foundation intentionally contains no business tables.

## Infrastructure

Local Compose runs PostgreSQL, Redis, and MinIO. `infra:down` preserves named volumes. Removing
volumes is a separate destructive action and is not part of the normal developer workflow.

## Reading Order

1. [README.md](../README.md)
2. [business/user-story.md](business/user-story.md)
3. [technical-specs/\_index.md](technical-specs/_index.md)
4. [api-specs/\_index.md](api-specs/_index.md)
5. [CODING_STANDARD.md](CODING_STANDARD.md)
6. [TASK_BREAKDOWN.md](TASK_BREAKDOWN.md)
