# API Specification Index

## Axentra: Document Management System

**Version:** 1.0.0<br>
**Base URL:** `/api/v1`  
**Status:** Foundation active, BA feature APIs planned

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

### Authentication

Authentication is a technical prerequisite for Member Team and Head of Team flows.

```text
TECHNICAL POST /auth/login
TECHNICAL POST /auth/refresh
TECHNICAL POST /auth/logout
TECHNICAL GET  /auth/me
```

### Documents

```text
OK      GET    /documents
PLANNED POST   /documents/upload
PLANNED POST   /documents/check-duplicate
PLANNED GET    /documents/:id
PLANNED GET    /documents/:id/preview
PLANNED GET    /documents/:id/download
PLANNED POST   /documents/bulk-download
PLANNED GET    /documents/:id/related
```

### Processing

```text
PLANNED GET /documents/:id/metadata
PLANNED GET /documents/:id/smart-tags
PLANNED GET /documents/:id/category
```

### Search, Tags, and Categories

```text
PLANNED GET /search/documents
PLANNED GET /tags/top
PLANNED GET /categories
```

### Analytics

```text
PLANNED GET /analytics/summary
```

### Audit

```text
PLANNED GET /audit/downloads
```

### Permission Category

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
