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

## Planned BA Business Modules

These modules are not implemented in Foundation v1.0.0. They need approved sprint scope before
code or tables are added.

| Module               | Planned Responsibility                                                                    |
| -------------------- | ----------------------------------------------------------------------------------------- |
| Authentication       | Login/session prerequisite for Member Team and Head of Team access                        |
| Documents            | Upload one or many files, list documents, detail, preview, single download, bulk download |
| Duplicate detection  | Detect same-content uploads and prevent duplicate persistence                             |
| Processing           | OCR/AI extraction, author metadata, Smart Tags, auto category                             |
| Search and discovery | Keyword search, Top Tags filtering, related documents                                     |
| Analytics            | Head of Team summary metrics for total documents and uploads in last 7 days               |
| Audit                | Download log showing who downloaded which document and when                               |
| Permission category  | Head of Team controls Member Team download permission per category                        |

## Personas

| Persona      | Planned Responsibility                                           |
| ------------ | ---------------------------------------------------------------- |
| Member Team  | Upload, search, preview, and download allowed documents          |
| Head of Team | View analytics, audit downloads, and manage category permissions |
