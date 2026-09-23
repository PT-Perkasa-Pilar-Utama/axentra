# Deployment Plan

## Axentra: Document Management System

**Version:** 0.1.0  
**Date:** 2026-09-16  
**Author:** Arya Isnaidi (Tech Lead)  
**Status:** Draft until hosting target is assigned

---

## Table of Contents

1. [Environments](#1-environments)
2. [Infrastructure Overview](#2-infrastructure-overview)
3. [Branch and Deploy Policy](#3-branch-and-deploy-policy)
4. [Build Artifact Strategy](#4-build-artifact-strategy)
5. [Initial Deployment](#5-initial-deployment)
6. [Updating to a New Release](#6-updating-to-a-new-release)
7. [Rollback](#7-rollback)
8. [Database Operations](#8-database-operations)
9. [Object Storage Operations](#9-object-storage-operations)
10. [Disaster Recovery](#10-disaster-recovery)
11. [Open Decisions](#11-open-decisions)

---

## 1. Environments

| Environment | Purpose                               | Branch | URL                     | Deployment PIC           |
| ----------- | ------------------------------------- | ------ | ----------------------- | ------------------------ |
| Local       | Developer machine with Docker Compose | any    | `http://localhost:5173` | Card PIC                 |
| Test        | Internal acceptance review            | `dev`  | To be assigned          | Arya Isnaidi (Tech Lead) |
| Production  | Live internal DMS                     | `main` | To be assigned          | Arya Isnaidi (Tech Lead) |

Local development runs on the developer machine with:

```powershell
bun run infra:up
bun run db:migrate
bun run dev:api
bun run dev:worker
bun run dev:web
```

Local endpoints:

| Surface       | URL                                         |
| ------------- | ------------------------------------------- |
| Web           | `http://localhost:5173`                     |
| API liveness  | `http://localhost:3001/api/v1/health`       |
| API readiness | `http://localhost:3001/api/v1/health/ready` |
| MinIO console | `http://localhost:9001`                     |

## 2. Infrastructure Overview

Axentra has three deployable processes plus backing services:

```text
            +-------------------+
            | Browser / Web UI  |
            +---------+---------+
                      |
                      v
+---------------------+----------------------+
| App runtime                                 |
|                                             |
|  Web static assets or Web container         |
|  API container: Bun + Hono                  |
|  Worker container: Bun + BullMQ             |
+---------+--------------------+-------------+
          |                    |
          v                    v
  PostgreSQL              Redis Queue
          |
          v
  S3-compatible object storage
```

Recommended hosted layout:

| Component      | Recommended runtime                                                     |
| -------------- | ----------------------------------------------------------------------- |
| Web            | Static build behind Nginx/CDN, or containerized Vite preview equivalent |
| API            | Containerized Bun process                                               |
| Worker         | Separate containerized Bun process                                      |
| PostgreSQL     | Managed PostgreSQL or VM-hosted PostgreSQL 16                           |
| Redis          | Managed Redis or VM-hosted Redis 7                                      |
| Object storage | Private S3-compatible bucket                                            |
| TLS            | Nginx, load balancer, or platform-managed TLS                           |

Key points:

- API and Worker are separate processes and must be deployed independently.
- API and Worker must run the same `APP_VERSION`.
- Worker must not accept jobs until PostgreSQL, Redis, and Storage are healthy.
- Web receives only `VITE_*` browser-safe configuration.
- Production credentials must be supplied by secure infrastructure configuration.
- Production bucket creation is not performed by application code.

## 3. Branch and Deploy Policy

`dev` is the shared integration and internal acceptance branch. Task branches are reviewed through
`dev` before Arya promotes an accepted release to `main`.

| Event                    | CI run | Build artifact                  | Deploy behavior                                        |
| ------------------------ | ------ | ------------------------------- | ------------------------------------------------------ |
| PR opened against `dev`  | Yes    | No production artifact required | No deploy                                              |
| Push or merge to `dev`   | Yes    | Test artifact                   | Arya deploys Test for internal acceptance verification |
| Release PR `dev -> main` | Yes    | Production artifact             | Deploy only after approval                             |
| Release tag on `main`    | Yes    | Immutable production artifact   | Arya deploys Production                                |

Current repository state:

- CI exists in `.github/workflows/ci.yml`.
- Docker runtime image workflow is not implemented yet.
- Hosted deployment files are not implemented yet.
- This document defines the target deployment runbook and the rules future deployment automation
  must satisfy.

### Versioning

The application version comes from `package.json`.

```powershell
bun pm pkg set version=0.1.0
git add package.json bun.lock
git commit -m "chore(release): v0.1.0"
```

Required image/tag strategy once container publishing exists:

| Tag              | Mutability | Purpose                          |
| ---------------- | ---------- | -------------------------------- |
| `dev`            | sliding    | Latest Test build                |
| `dev-<version>`  | immutable  | Reproducible Test rollback       |
| `prod`           | sliding    | Latest Production release        |
| `prod-<version>` | immutable  | Reproducible Production rollback |
| `<version>`      | immutable  | Environment-neutral version pin  |

Never overwrite an existing immutable tag.

## 4. Build Artifact Strategy

Axentra builds three outputs:

| Process | Command                           | Current output              |
| ------- | --------------------------------- | --------------------------- |
| Web     | `bun run --cwd apps/web build`    | `apps/web/dist`             |
| API     | `bun run --cwd apps/api build`    | `apps/api/dist/server.js`   |
| Worker  | `bun run --cwd apps/worker build` | `apps/worker/dist/index.js` |

Required pre-build gate:

```powershell
bun run complete-check
```

Recommended future artifacts:

- `axentra-web:<tag>`
- `axentra-api:<tag>`
- `axentra-worker:<tag>`

Alternative acceptable artifact:

- One repository image with separate process commands for Web/API/Worker, as long as process
  boundaries remain separate at runtime.

## 5. Initial Deployment

Run once per environment after hosting target is assigned.

### 5.1 Prerequisites

Required infrastructure:

- PostgreSQL 16.
- Redis 7.
- Private S3-compatible object storage bucket.
- Runtime host or platform for Web, API, and Worker.
- TLS termination.
- Secure secret storage.
- Log retention.
- Backup destination.

### 5.2 Environment Variables

Follow [technical-specs/11-environment-configuration.md](technical-specs/11-environment-configuration.md).

API and Worker:

```text
APP_ENV=production
APP_VERSION=0.1.0
LOG_LEVEL=info
API_PORT=3001
API_SHUTDOWN_TIMEOUT_MS=15000
DATABASE_URL=postgres://<user>:<password>@<host>:5432/<database>
REDIS_URL=redis://<host>:6379/0
QUEUE_NAME=axentra-jobs
WORKER_CONCURRENCY=2
WORKER_SHUTDOWN_TIMEOUT_MS=15000
S3_PROVIDER=s3
S3_ENDPOINT=
S3_REGION=ap-southeast-3
S3_BUCKET=<private-bucket>
S3_ACCESS_KEY_ID=<secure-runtime-value>
S3_SECRET_ACCESS_KEY=<secure-runtime-value>
S3_FORCE_PATH_STYLE=false
```

Web:

```text
VITE_API_BASE_URL=/api/v1
```

Rules:

- Do not commit `.env`.
- Do not store production credentials in GitHub workflow logs.
- Prefer workload identity or IAM role over long-lived object storage keys where the host supports
  it.
- API and Worker must share the same `DATABASE_URL`, `REDIS_URL`, `QUEUE_NAME`, `APP_VERSION`, and
  storage configuration.

### 5.3 Database Setup

Create the database and user out-of-band through the selected PostgreSQL platform or VM.

Apply migrations from the release artifact:

```bash
bun --env-file=.env packages/db/src/migrate.ts
```

For containerized runtime, the command must be exposed as an equivalent migration entrypoint.

Foundation v1.0.0 has no business tables, but the migration gate still runs to verify the Drizzle
boundary.

### 5.4 Object Storage Setup

Create the production bucket out-of-band.

Required bucket rules:

- Private by default.
- No public object access.
- Server-side encryption enabled where available.
- Versioning enabled where available.
- Lifecycle retention policy approved before production cutover.

Application code may create the local MinIO bucket. It must not create the production bucket.

### 5.5 Process Startup Order

Start hosted services in this order:

1. PostgreSQL.
2. Redis.
3. Object storage.
4. Run migrations.
5. API.
6. Worker.
7. Web.

Verify:

```bash
curl -sf https://<env-host>/api/v1/health
curl -sf https://<env-host>/api/v1/health/ready
```

Readiness must return `ready` for database, redis, and storage before the environment is handed to
the assigned card PIC for acceptance verification or to users.

## 6. Updating to a New Release

### 6.1 Test

1. Merge the task PR into `dev`.
2. Confirm CI is green.
3. Build or publish the Test artifact.
4. Apply migrations if schema changed.
5. Roll API and Worker to the same version.
6. Roll Web.
7. Verify health and readiness.

### 6.2 Production

1. Promote `dev -> main` through a release PR.
2. Publish a versioned release tag.
3. Confirm artifact immutability.
4. Take a fresh database backup.
5. Apply migrations.
6. Deploy API and Worker with the same version.
7. Deploy Web.
8. Verify health, readiness, logs, and smoke flows.

### 6.3 Verification

Minimum checks after every deployment:

```bash
curl -sf https://<env-host>/api/v1/health
curl -sf https://<env-host>/api/v1/health/ready
```

Application checks:

- Web shell loads.
- API returns the expected `APP_VERSION`.
- Worker starts without dependency errors.
- No secret or signed URL appears in logs.
- For BA feature releases, linked AC flows are verified.

## 7. Rollback

Rollback is artifact-based.

1. Identify the last known good immutable tag.
2. Stop new deploys.
3. Roll API and Worker back to the same version.
4. Roll Web back to the matching version.
5. Verify `/api/v1/health` and `/api/v1/health/ready`.

Database rollback:

- Non-destructive forward-compatible migrations can usually remain in place.
- Destructive migrations require restore from backup or an Arya-approved forward fix.
- Down migrations are not assumed to exist.

Do not roll back only API or only Worker unless Arya confirms cross-process compatibility.

## 8. Database Operations

### 8.1 Migration Inspection

```sql
SELECT * FROM drizzle.__drizzle_migrations ORDER BY created_at;
```

### 8.2 Backup

For VM-hosted PostgreSQL:

```bash
pg_dump -Fc "$DATABASE_URL" > axentra_<env>_$(date -u +%Y%m%dT%H%M%SZ).dump
```

For managed PostgreSQL, use provider-native backups plus periodic logical dumps.

Retention target:

- 7 nightly backups.
- 4 weekly backups.
- Off-host storage.

### 8.3 Restore

Restore only with Arya's Tech Lead approval for Test and Production.

```bash
pg_restore --clean --if-exists --dbname "$DATABASE_URL" axentra_<env>_<timestamp>.dump
```

After restore:

```bash
bun --env-file=.env packages/db/src/migrate.ts
curl -sf https://<env-host>/api/v1/health/ready
```

### 8.4 Reset

Production reset is prohibited.

Test reset requires:

- Confirm target environment.
- Take backup if data matters.
- Drop/recreate schema or database.
- Run migrations.
- Re-seed only approved non-production data.

## 9. Object Storage Operations

### 9.1 Backup and Versioning

Production bucket should enable object versioning where available. If provider-native versioning is
not available, object backup strategy must be approved before go-live.

### 9.2 Access

- Bucket is private.
- Objects are not public.
- Downloads use server-side authorization checks before issuing access.
- Signed URLs use bounded TTL.

### 9.3 Incident Handling

If an object is deleted or corrupted:

1. Identify document ID and object key from database.
2. Restore object from version history or backup.
3. Verify metadata record still points to the restored object.
4. Write an incident note in the operational log.

## 10. Disaster Recovery

| Failure                    | Recovery                                                                                             |
| -------------------------- | ---------------------------------------------------------------------------------------------------- |
| Web artifact fails         | Roll back Web to previous immutable tag.                                                             |
| API fails at startup       | Inspect logs, verify env, roll back API and Worker together if needed.                               |
| Worker fails at startup    | Inspect dependency readiness, queue config, and storage config.                                      |
| Migration fails            | Stop rollout, inspect migration state, restore backup if partial data change occurred.               |
| PostgreSQL unavailable     | Restore managed service or VM backup, then run readiness check.                                      |
| Redis unavailable          | Restore Redis service; queued jobs may need replay depending on persistence mode.                    |
| Object storage unavailable | Block upload/download features until storage readiness is healthy.                                   |
| Credential leak            | Rotate affected credentials, restart API and Worker, invalidate signed URLs where possible.          |
| Document data leak         | Disable affected download routes, rotate credentials, preserve audit logs, follow incident response. |

Escalation: Arya Isnaidi (Tech Lead) is the only person authorized to execute production restore or destructive
database recovery.

## 11. Open Decisions

These must be resolved before production deployment:

- Hosting target.
- Container registry and image naming.
- Runtime layout: one image with multiple commands or separate Web/API/Worker images.
- Environment hostnames.
- TLS termination.
- Production PostgreSQL provider.
- Production Redis provider.
- Production object storage bucket and lifecycle policy.
- Backup destination and retention.
- Observability sink.
- Deployment automation PIC and platform.
