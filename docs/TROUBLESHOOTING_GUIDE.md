# Troubleshooting Guide

## Axentra: Document Management System

**Version:** 0.1.0  
**Date:** 2026-09-16  
**Author:** Arya Isnaidi (Tech Lead)  
**Status:** Living Document

Use this guide when local development, infrastructure, health checks, tests, or planned DMS flows
do not behave as expected.

---

## Table of Contents

1. [How to Use This Guide](#1-how-to-use-this-guide)
2. [Diagnostic Tools](#2-diagnostic-tools)
3. [Bun and Dependency Issues](#3-bun-and-dependency-issues)
4. [Docker and Local Infrastructure Issues](#4-docker-and-local-infrastructure-issues)
5. [Database and Migration Issues](#5-database-and-migration-issues)
6. [Redis and Queue Issues](#6-redis-and-queue-issues)
7. [MinIO and Object Storage Issues](#7-minio-and-object-storage-issues)
8. [API Health and Readiness Issues](#8-api-health-and-readiness-issues)
9. [Web Issues](#9-web-issues)
10. [Worker Issues](#10-worker-issues)
11. [Test, Lint, Format, and Build Issues](#11-test-lint-format-and-build-issues)
12. [Future DMS Feature Issues](#12-future-dms-feature-issues)
13. [Documentation Issues](#13-documentation-issues)
14. [Escalation](#14-escalation)

---

## 1. How to Use This Guide

Each entry has:

- Symptom.
- Likely cause.
- Steps to diagnose.
- Resolution.

Rules:

- Always capture logs before changing configuration.
- Fix the first failing dependency before debugging the app layer.
- Do not delete Docker volumes unless the data is disposable and Arya approves.
- Do not mark an AC or E2E scenario as passed unless it was actually verified.

---

## 2. Diagnostic Tools

### 2.1 Local service status

```powershell
docker compose -f infra/local/docker-compose.yml ps
```

Expected services:

| Service    | Container name     | Port mapping             |
| ---------- | ------------------ | ------------------------ |
| PostgreSQL | `axentra-postgres` | `5432:5432`              |
| Redis      | `axentra-redis`    | `6379:6379`              |
| MinIO      | `axentra-minio`    | `9000:9000`, `9001:9001` |

### 2.2 Container logs

```powershell
docker compose -f infra/local/docker-compose.yml logs postgres --tail 100
docker compose -f infra/local/docker-compose.yml logs redis --tail 100
docker compose -f infra/local/docker-compose.yml logs minio --tail 100
```

Follow logs:

```powershell
docker compose -f infra/local/docker-compose.yml logs postgres -f
```

### 2.3 API health

```powershell
Invoke-RestMethod http://localhost:3001/api/v1/health
Invoke-RestMethod http://localhost:3001/api/v1/health/ready
```

Liveness checks the API process. Readiness checks PostgreSQL, Redis, and storage.

### 2.4 Database

```powershell
docker exec axentra-postgres pg_isready -U axentra -d axentra
docker exec axentra-postgres psql -U axentra -d axentra -c "SELECT version();"
docker exec axentra-postgres psql -U axentra -d axentra -c "SELECT * FROM drizzle.__drizzle_migrations ORDER BY created_at;"
```

### 2.5 Redis

```powershell
docker exec axentra-redis redis-cli PING
docker exec axentra-redis redis-cli INFO server
```

### 2.6 MinIO

Open:

```text
http://localhost:9001
```

Use local credentials from `.env.example`.

---

## 3. Bun and Dependency Issues

### 3.1 `bun install` fails

Likely causes:

- Bun is not installed.
- Bun version is too old.
- Lockfile and package metadata are out of sync.
- Network or registry access failed.

Diagnose:

```powershell
bun --version
Get-Content package.json
```

Resolution:

- Install or update Bun to the version declared in `package.json`.
- Re-run `bun install`.
- Do not delete `bun.lock` as a first response. Inspect the actual error first.

### 3.2 Workspace package cannot be resolved

Symptom:

```text
Cannot find package '@axentra/...'
```

Likely causes:

- Dependencies were not installed.
- Command is running from the wrong directory.
- Workspace package has a TypeScript or export issue.

Diagnose:

```powershell
Get-Location
bun install
bun run type-check
```

Resolution:

- Run commands from repository root.
- Run `bun install`.
- Fix the first package that fails in `bun run type-check`.

---

## 4. Docker and Local Infrastructure Issues

### 4.1 `bun run infra:up` fails

Likely causes:

- Docker Desktop is not running.
- A port is already in use.
- Previous containers are unhealthy.
- Docker has stale state.

Diagnose:

```powershell
docker version
docker compose -f infra/local/docker-compose.yml ps
docker compose -f infra/local/docker-compose.yml logs postgres --tail 100
docker compose -f infra/local/docker-compose.yml logs redis --tail 100
docker compose -f infra/local/docker-compose.yml logs minio --tail 100
```

Resolution:

- Start Docker Desktop.
- Stop the conflicting local service.
- Keep PostgreSQL mapped to `5432:5432`.
- Restart infrastructure:

```powershell
bun run infra:down
bun run infra:up
```

### 4.2 PostgreSQL port conflict

Symptom:

```text
Bind for 0.0.0.0:5432 failed
```

Likely cause: another local process already uses port `5432`.

Diagnose:

```powershell
netstat -ano | findstr :5432
```

Resolution:

- Stop the conflicting process, or temporarily change the local Compose port and `.env`.
- Stop the conflicting PostgreSQL service or choose a different local port consistently across `.env`, Compose, and docs.

### 4.3 Redis port conflict

Diagnose:

```powershell
netstat -ano | findstr :6379
```

Resolution:

- Stop the conflicting Redis service.
- Restart local infrastructure.

### 4.4 MinIO console does not open

Diagnose:

```powershell
docker compose -f infra/local/docker-compose.yml ps minio
docker compose -f infra/local/docker-compose.yml logs minio --tail 100
```

Resolution:

- Confirm MinIO is healthy.
- Open `http://localhost:9001`.
- Confirm port `9001` is not used by another process.

---

## 5. Database and Migration Issues

### 5.1 Migration fails with connection refused

Likely causes:

- PostgreSQL container is not running.
- PostgreSQL is not healthy yet.
- `DATABASE_URL` points to the wrong port.
- `.env` is missing.

Diagnose:

```powershell
Test-Path .env
docker compose -f infra/local/docker-compose.yml ps postgres
docker exec axentra-postgres pg_isready -U axentra -d axentra
Select-String -Path .env -Pattern "DATABASE_URL"
```

Resolution:

```powershell
Copy-Item .env.example .env
bun run infra:up
bun run db:migrate
```

Confirm local `DATABASE_URL` uses `localhost:5432`.

### 5.2 Migration reports no schema changes

Expected for Foundation v0.1.0.

Foundation intentionally has no business tables. Domain tables are added only by reviewed sprint
cards.

### 5.3 `drizzle.__drizzle_migrations` does not exist

Likely cause: migrations have not run or the database volume is fresh.

Diagnose:

```powershell
bun run db:migrate
docker exec axentra-postgres psql -U axentra -d axentra -c "SELECT schema_name FROM information_schema.schemata ORDER BY schema_name;"
```

Resolution:

- Run `bun run db:migrate`.
- If migration fails, fix the first database connection/config error before inspecting schema.

### 5.4 Disposable local database needs a reset

Do not reset by default. Resetting deletes local data.

For disposable local data only:

```powershell
bun run infra:down
```

Then remove named Docker volumes through Docker Desktop or explicit Docker commands only after
confirming the target volumes:

| Volume name             | Purpose         |
| ----------------------- | --------------- |
| `axentra-postgres-data` | PostgreSQL data |
| `axentra-redis-data`    | Redis data      |
| `axentra-minio-data`    | MinIO data      |

After reset:

```powershell
bun run infra:up
bun run db:migrate
```

Never run destructive resets against shared Test or Production.

---

## 6. Redis and Queue Issues

### 6.1 Redis readiness fails

Diagnose:

```powershell
docker compose -f infra/local/docker-compose.yml ps redis
docker exec axentra-redis redis-cli PING
docker compose -f infra/local/docker-compose.yml logs redis --tail 100
```

Resolution:

- Restart local infrastructure.
- Confirm `REDIS_URL` in `.env` points to `redis://localhost:6379`.

### 6.2 Worker cannot enqueue or consume jobs

Likely causes:

- Redis is unavailable.
- `QUEUE_NAME` differs between API and Worker.
- Worker process is not running.

Diagnose:

```powershell
Select-String -Path .env -Pattern "REDIS_URL|QUEUE_NAME"
docker exec axentra-redis redis-cli KEYS "*"
```

Resolution:

- Start Redis through `bun run infra:up`.
- Start Worker with `bun run dev:worker`.
- Keep API and Worker on the same `QUEUE_NAME`.

---

## 7. MinIO and Object Storage Issues

### 7.1 Storage readiness fails

Likely causes:

- MinIO container is not healthy.
- Local MinIO credentials do not match `.env`.
- Bucket initialization failed.
- S3 endpoint is incorrect.

Diagnose:

```powershell
docker compose -f infra/local/docker-compose.yml ps minio
docker compose -f infra/local/docker-compose.yml logs minio --tail 100
Select-String -Path .env -Pattern "S3_"
Invoke-RestMethod http://localhost:3001/api/v1/health/ready
```

Resolution:

- Confirm MinIO is running on `http://localhost:9000`.
- Confirm MinIO console opens at `http://localhost:9001`.
- Check `.env` against `.env.example`.
- Restart API after changing storage config.

### 7.2 Signed URL or object access fails

Likely causes:

- Object does not exist.
- Bucket configuration is wrong.
- Signed URL expired.
- System clock is out of sync.

Resolution:

- Reproduce through the API, not direct object URL guessing.
- Verify object key exists in MinIO console.
- Request a fresh signed URL through the app.
- Do not log signed URLs in issue reports.

---

## 8. API Health and Readiness Issues

### 8.1 `GET /api/v1/health` fails

Likely causes:

- API process is not running.
- API port changed.
- Another process uses port `3001`.

Diagnose:

```powershell
Invoke-RestMethod http://localhost:3001/api/v1/health
netstat -ano | findstr :3001
```

Resolution:

```powershell
bun run dev:api
```

### 8.2 `GET /api/v1/health/ready` returns unavailable

Likely causes:

- PostgreSQL unavailable.
- Redis unavailable.
- Storage unavailable.
- `.env` mismatch.

Diagnose:

```powershell
Invoke-RestMethod http://localhost:3001/api/v1/health/ready
docker compose -f infra/local/docker-compose.yml ps
```

Resolution:

- Fix the failing dependency shown by readiness.
- Restart API after changing `.env`.
- Re-run readiness after the dependency is healthy.

### 8.3 API returns 500

Diagnose:

- Inspect API terminal output.
- Check for config validation failure.
- Re-run focused tests:

```powershell
bun run --cwd apps/api type-check
bun test apps/api
```

Resolution:

- Fix the first stack trace.
- Add a regression test if the error is from application logic.
- Do not catch and suppress errors without logging safe context.

---

## 9. Web Issues

### 9.1 Web shell does not load

Likely causes:

- Web dev server is not running.
- Port `5173` is in use.
- Dependency install failed.

Diagnose:

```powershell
bun run dev:web
netstat -ano | findstr :5173
```

Resolution:

- Stop the conflicting process.
- Run `bun install`.
- Start Web again.

### 9.2 Web shows API not connected

Likely causes:

- API process is not running.
- Readiness dependency failed.
- `VITE_API_BASE_URL` is wrong.

Diagnose:

```powershell
Invoke-RestMethod http://localhost:3001/api/v1/health
Invoke-RestMethod http://localhost:3001/api/v1/health/ready
Select-String -Path .env -Pattern "VITE_API_BASE_URL"
```

Resolution:

- Start API with `bun run dev:api`.
- Keep local `VITE_API_BASE_URL=/api/v1`.
- Fix readiness dependencies before debugging Web state.

### 9.3 UI state looks stale

Likely causes:

- TanStack Query cache has not refreshed.
- API returned stale data.
- Browser has old Vite module state.

Resolution:

- Hard refresh browser.
- Restart `bun run dev:web`.
- Inspect Network tab and API response before changing UI code.

---

## 10. Worker Issues

### 10.1 Worker exits immediately

Likely causes:

- Environment validation failed.
- Redis is unavailable.
- Storage or database config is invalid.

Diagnose:

```powershell
bun run dev:worker
Select-String -Path .env -Pattern "APP_ENV|REDIS_URL|QUEUE_NAME|DATABASE_URL|S3_"
```

Resolution:

- Fix `.env`.
- Start local infrastructure.
- Restart Worker.

### 10.2 Worker does not shut down cleanly

Diagnose:

```powershell
bun test apps/worker
```

Resolution:

- Check graceful shutdown handling.
- Keep `WORKER_SHUTDOWN_TIMEOUT_MS` aligned with `.env.example`.
- Do not add long blocking sleeps in job handlers.

---

## 11. Test, Lint, Format, and Build Issues

### 11.1 `bun run complete-check` fails

Run each gate separately:

```powershell
bun run type-check
bun run lint
bun run fmt
bun run test
bun run build
```

Fix the first failing gate before re-running the full check.

### 11.2 Format fails

Symptom:

```text
Format issues found
```

Resolution:

```powershell
bun run fmt:fix
bun run fmt
```

### 11.3 Lint fails

Diagnose:

```powershell
bun run lint
```

Resolution:

- Fix the reported file and rule.
- Use `bun run lint:fix` only for mechanical fixes.
- Do not disable rules without Arya's Tech Lead approval.

### 11.4 Type-check fails

Diagnose package scope:

```powershell
bun run type-check:packages
bun run type-check:apps
```

Resolution:

- Fix package errors before app errors if both fail.
- Keep browser-safe contracts in `packages/shared`.
- Do not import server-only packages into Web.

### 11.5 Integration tests fail

Likely causes:

- Local infrastructure is not running.
- PostgreSQL, Redis, or MinIO is unhealthy.
- `.env` mismatch.

Diagnose:

```powershell
bun run infra:up
docker compose -f infra/local/docker-compose.yml ps
bun run test:integration
```

Resolution:

- Fix unhealthy containers.
- Confirm `.env` was copied from `.env.example`.
- Re-run integration tests.

---

## 12. Future DMS Feature Issues

These features are planned and not implemented in Foundation v0.1.0. Use this section once the
related sprint cards land.

### 12.1 Upload rejects a valid PDF or DOCX

Likely causes:

- MIME/extension policy is too strict.
- File size limit is exceeded.
- Multipart parsing failed.
- Storage write failed.

Resolution:

- Confirm allowed file policy in `docs/api-specs/03-documents.md`.
- Check API logs for validation vs storage failure.
- Add regression tests for the accepted file type.

### 12.2 Duplicate warning does not appear

Likely causes:

- Content hash is computed inconsistently.
- Duplicate check compares filename instead of content.
- Duplicate route is not called before persistence.

Resolution:

- Compare hash values for both uploads.
- Confirm duplicate logic maps to AC-02.01 and AC-02.02.
- Add tests for same-content different-filename uploads.

### 12.3 Search is slow or returns irrelevant results

Likely causes:

- Search index not updated after processing.
- Query does not include extracted content.
- No-result state is not handled.

Resolution:

- Check processing status.
- Check search index rows.
- Verify AC-06.01 to AC-06.04.

### 12.4 Download is allowed when category permission is inactive

This is a blocker.

Likely causes:

- Frontend hides the button but API does not enforce permission.
- Category permission default is wrong.
- Download route bypasses authorization.

Resolution:

- Fix server-side authorization first.
- Confirm newly auto-created categories default to inactive.
- Add tests for denied single and bulk download.
- Write or verify download audit behavior only for successful downloads.

### 12.5 Audit trail misses a successful download

Likely causes:

- Download route does not write audit event.
- Bulk download writes only one event when per-document events are required.
- Transaction or async write failed.

Resolution:

- Check `download_audit_events`.
- Make audit write part of the successful download path.
- Add tests for single and bulk download audit.

---

## 13. Documentation Issues

### 13.1 Markdown formatting fails

Resolution:

```powershell
bun run fmt:fix
bun run fmt
```

### 13.2 Docs mention another project

This is not allowed. Axentra docs must not carry domain terms from another codebase.

Diagnose:

```powershell
rg -n "legacy-domain-term-1|legacy-domain-term-2|legacy-route-name" docs README.md
```

Resolution:

- Replace the old domain term with the correct Axentra DMS term.
- If no Axentra equivalent exists, remove the copied section.

### 13.3 Docs describe a planned feature as implemented

Resolution:

- Mark it as `Planned`, `Deferred`, or `Foundation v0.1.0 excludes this`.
- Do not imply business APIs exist until code, tests, and verification prove they exist.

---

## 14. Escalation

Escalation order:

1. This guide.
2. [DEVELOPMENT_SCENARIO_GUIDE.md](DEVELOPMENT_SCENARIO_GUIDE.md).
3. Peer developer.
4. Arya Isnaidi (Tech Lead).

Before escalating, capture:

- Time of incident.
- Branch name.
- Task ID.
- Exact command.
- Exact error snippet.
- Relevant logs.
- Whether Docker Desktop is running.
- Output of `docker compose -f infra/local/docker-compose.yml ps`.
- Whether `.env` was copied from `.env.example`.

Production or shared environment recovery must follow [DEPLOYMENT_PLAN.md](DEPLOYMENT_PLAN.md).
Only Arya Isnaidi (Tech Lead) is authorized to execute destructive recovery.
