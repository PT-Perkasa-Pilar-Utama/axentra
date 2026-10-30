# API Specification Index

## Axentra: Document Management System

**Version:** 1.0.0<br>
**Base URL:** `/api/v1`  
**Status:** Sprint 1-3 APIs implemented on `dev`; Sprint 4 APIs planned

Legend:

- `OK`: implemented and tested.
- `PLANNED`: sourced from BA workbook, not implemented.
- `TECHNICAL`: required platform capability, not directly listed as BA user story.

## Endpoint Status Tracker

### System

```text
OK GET /health
OK GET /health/ready
```

### Authentication (TECHNICAL prerequisite)

Authentication is a technical prerequisite for Member Team and Head of Team flows.

```text
OK      POST   /auth/login
OK      POST   /auth/refresh
OK      POST   /auth/logout
OK      GET    /auth/me
```

### Documents

```text
OK      GET    /documents
OK      POST   /documents/upload
OK      POST   /documents/check-duplicate
OK      GET    /documents/:id
OK      GET    /documents/:id/preview
OK      GET    /documents/:id/preview/content
OK      GET    /documents/:id/download
OK      POST   /documents/bulk-download
OK      GET    /documents/:id/related
```

`GET /documents/:id` returns the document detail that the Web detail page reads, including
`canDownload`. `GET /documents/:id/preview` returns preview metadata only. The content route
`GET /documents/:id/preview/content` streams the stored file through the API for inline rendering
and issues no storage URL. The API registers `POST /documents/upload` only when the process enables
the upload route, and `apps/api/src/server.ts` enables it.

### Processing

```text
OK      GET /documents/:id/metadata
OK      GET /documents/:id/smart-tags
OK      GET /documents/:id/category
```

### Search, Tags, and Categories

```text
OK GET /search/documents
OK GET /tags/top
OK GET /categories
```

### Analytics (Sprint 4)

```text
OK GET /analytics/summary
```

### Audit (Sprint 4)

```text
OK      GET /audit/downloads
```

### Permission Category (Sprint 4)

```text
PLANNED GET   /permission-categories
PLANNED PATCH /permission-categories/:categoryId
```

## Documents

| File                                                         | Purpose                                                        |
| ------------------------------------------------------------ | -------------------------------------------------------------- |
| [01-conventions.md](01-conventions.md)                       | API envelope, error, pagination, and naming conventions        |
| [02-authentication.md](02-authentication.md)                 | Technical authentication prerequisite                          |
| [03-documents.md](03-documents.md)                           | BA document upload, duplicate, preview, download, related docs |
| [04-processing.md](04-processing.md)                         | OCR/AI metadata, Smart Tags, and auto-category processing      |
| [05-search-tags-categories.md](05-search-tags-categories.md) | Search, Top Tags, tag filtering, categories                    |
| [06-analytics.md](06-analytics.md)                           | Head of Team analytics                                         |
| [07-audit-permissions.md](07-audit-permissions.md)           | Download audit trail and category download permission          |
| [08-system.md](08-system.md)                                 | Implemented health and readiness endpoints                     |
