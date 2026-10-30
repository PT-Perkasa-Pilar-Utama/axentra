# Module Definitions

## Implemented Foundation Modules

### Health

| Area         | Detail                                           |
| ------------ | ------------------------------------------------ |
| API routes   | `GET /api/v1/health`, `GET /api/v1/health/ready` |
| Service      | Evaluates bounded dependency checks              |
| Dependencies | PostgreSQL, Redis, Storage                       |
| Response     | Stable success envelope from `@axentra/shared`   |

### Platform Status

| Area        | Detail                                  |
| ----------- | --------------------------------------- |
| Web feature | `apps/web/src/features/platform-status` |
| API call    | `GET /health` through the API client    |
| Refresh     | TanStack Query refetch every 30 seconds |
| States      | loading, ready, error                   |

### Queue

| Area          | Detail                                    |
| ------------- | ----------------------------------------- |
| Package       | `packages/queue`                          |
| Technical job | `system.health-check`                     |
| Payload       | Versioned, Zod-validated, identifier-only |

### Storage

| Area                | Detail               |
| ------------------- | -------------------- |
| Package             | `packages/storage`   |
| Contract            | `StorageAdapter`     |
| Local provider      | MinIO                |
| Production provider | S3-compatible bucket |

## Implemented Sprint 1-3 BA Modules (on `dev`)

These modules are implemented on `dev`. They are not part of Foundation v1.0.0.

| Module               | Status                             | Location                                            | Notes                                                                                                                                                                   |
| -------------------- | ---------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authentication       | Implemented                        | `apps/api/src/modules/auth`, `/api/v1/auth/*`       | Login, refresh with rotation, logout, and current user. Sessions are stored in `auth_sessions`; production identities are read from `users`.                            |
| Documents            | Implemented                        | `apps/api/src/modules/documents`                    | Upload, list, detail, preview, single download, bulk download, and related documents. Upload is registered only when the process enables it (`apps/api/src/server.ts`). |
| Duplicate detection  | Implemented                        | `apps/api/src/modules/documents`                    | `POST /documents/check-duplicate` and the upload path check the SHA-256 content hash.                                                                                   |
| Processing           | Implemented, no OCR or AI provider | `apps/worker/src/processors`                        | Author metadata for PDF and DOCX, Smart Tags, auto category, and recovery of stalled documents. Extraction is deterministic.                                            |
| Search and discovery | Implemented                        | `apps/api/src/modules/search`, `tags`, `categories` | Keyword search, Top Tags, and categories. Related documents are served by the Documents module.                                                                         |

## Planned BA Business Modules

These modules are Sprint 4 scope. They need approved sprint scope before code or tables are added.
The Audit and Permission category rows note the parts that already exist.

| Module              | Planned Responsibility                                                                                                                                                                                     |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Analytics           | Head of Team summary metrics for total documents and uploads in last 7 days. Planned endpoint: `GET /analytics/summary`.                                                                                   |
| Audit               | Download log showing who downloaded which document and when. Downloads already write `download_audit_events`; the audit endpoint (`GET /audit/downloads`) and its screen are planned.                      |
| Permission category | Head of Team controls Member Team download permission per category. Download gating is already enforced; the permission endpoints (`GET` and `PATCH /permission-categories`) and their screen are planned. |

## Personas

| Persona      | Planned Responsibility                                           |
| ------------ | ---------------------------------------------------------------- |
| Member Team  | Upload, search, preview, and download allowed documents          |
| Head of Team | View analytics, audit downloads, and manage category permissions |
