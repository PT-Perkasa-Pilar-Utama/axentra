# Glossary

## Axentra: Document Management System

**Version:** 0.1.0  
**Date:** 2026-09-16  
**Author:** Arya Isnaidi (Tech Lead)  
**Status:** Living Document

The application uses Bahasa Indonesia for business copy and English for code. This glossary maps
the domain language, UI labels, planned code names, and technical terms used across Axentra.

Convention in this document: Bahasa Indonesia terms that appear inside English prose are wrapped in
quotes. Example: the code field is `filename`; the UI label is `"Nama File"`.

---

## Table of Contents

1. [Product and Domain Terms](#1-product-and-domain-terms)
2. [Documents and Processing](#2-documents-and-processing)
3. [Search, Tags, and Categories](#3-search-tags-and-categories)
4. [Preview, Download, and Permissions](#4-preview-download-and-permissions)
5. [Roles and Access](#5-roles-and-access)
6. [Analytics and Audit](#6-analytics-and-audit)
7. [System and Technical Terminology](#7-system-and-technical-terminology)
8. [Status Values Reference](#8-status-values-reference)
9. [Code-to-UI Mapping](#9-code-to-ui-mapping)

---

## 1. Product and Domain Terms

### Axentra

Internal Document Management System for uploading, organizing, discovering, previewing, downloading,
and auditing team documents.

### DMS

Document Management System. In Axentra, DMS means the whole product: Web UI, API, Worker,
PostgreSQL, Redis queue, and object storage.

### Knowledge Base

The document collection managed inside Axentra. User story wording refers to keeping the knowledge
base clean and easy to search.

### Document

The primary business object. A file uploaded by Member Team and enriched with metadata, Smart Tags,
category, preview capability, download permission, and audit history.

Planned table: `documents`.

### File

The binary object stored in object storage. A document may have one stored file in the first
implementation, while bulk flows can involve multiple selected documents.

Planned table: `document_files`.

### Original Format

The uploaded document format, such as PDF or DOCX. Downloads must preserve the original format for
single-document download.

### Recent Documents

Dashboard list showing documents recently uploaded or processed. Used by AC-01.02.

### Duplicate Document

A document with the same content as an existing uploaded document. Duplicate detection must compare
content, not only filename.

### Non-Duplicate Document

A document whose content hash does not match an existing stored document. It must be accepted even
if another document already exists in the system.

---

## 2. Documents and Processing

### Upload (`"Unggah Dokumen"`)

Member Team action for adding one or more documents into Axentra. Planned API:
`POST /api/v1/documents/upload`.

AC references: AC-01.01, AC-01.04.

### Unsupported File

A file type that Axentra does not accept. The BA example is `.JPG`. Unsupported uploads must be
rejected with clear feedback.

AC reference: AC-01.03.

### Duplicate Detection

Same-content detection used to prevent duplicate persistence. Planned implementation uses content
hashing before the final document is stored as a new knowledge item.

AC references: AC-02.01, AC-02.02, AC-02.03.

### Content Hash

Deterministic hash of file contents used by duplicate detection.

Planned table area: `document_content_hashes`.

### Metadata

Structured document information extracted automatically, such as author. UI copy may refer to this
as `"Metadata Dokumen"`.

Planned table: `document_metadata`.

AC reference: AC-03.01.

### Author Metadata

The author value extracted from a document. This is the explicit BA metadata example.

### Processing

Background enrichment step that may extract metadata, create Smart Tags, assign category, update
search index, and prepare preview data.

Planned table area: `processing_jobs`, `ocr_results`.

### OCR

Optical Character Recognition. Planned integration for extracting text from documents when needed.
Deferred in Foundation v1.0.0.

### AI Extraction

Planned provider-backed or deterministic extraction layer for metadata, Smart Tags, and category
classification. Deferred until an approved provider is selected.

### Deterministic Placeholder

Non-production or early-sprint implementation that returns predictable processing output behind the
same interface as the future OCR/AI provider.

---

## 3. Search, Tags, and Categories

### Smart Tags

Automatically generated tags based on document content. UI copy may use `"Tag Otomatis"` or
`"Smart Tags"`.

Planned table area: `smart_tags`.

AC reference: AC-04.02.

### Top Tags

Frequently used or contextually relevant tags shown as filters on dashboard or search views.

AC reference: AC-04.01.

### Single-Tag Filter

Search or list filter with one active tag.

AC reference: AC-04.03.

### Multi-Tag Filter

Search or list filter with more than one active tag.

AC reference: AC-04.04.

### Category

System-generated or managed grouping for documents. UI copy may use `"Kategori Dokumen"`.

Planned table: `categories`.

AC references: AC-05.01, AC-05.02.

### Auto Category

Category assigned automatically from document content.

### Search (`"Pencarian"`)

Finding documents by keyword from title or extracted content. Planned API:
`GET /api/v1/search/documents`.

AC references: AC-06.01 to AC-06.04.

### Search Snippet

Short relevant text shown in search results to explain why a document matched the keyword.

AC reference: AC-06.02.

### No-Result State

UI state shown when a search keyword does not match any document.

AC reference: AC-06.04.

### Related Documents (`"Dokumen Terkait"`)

Suggestions shown on a document detail page based on shared tags or other relevance signals.

Planned API: `GET /api/v1/documents/:id/related`.

AC references: AC-07.01, AC-07.02.

---

## 4. Preview, Download, and Permissions

### Preview (`"Preview Dokumen"`)

Viewing document contents without downloading the original file.

Planned API: `GET /api/v1/documents/:id/preview`.

AC reference: AC-08.01.

### Download (`"Unduh Dokumen"`)

Downloading the original document file when role and category permission allow it.

Planned API: `GET /api/v1/documents/:id/download`.

AC reference: AC-09.01.

### Bulk Download (`"Unduh Massal"`)

Downloading multiple selected documents as one `.zip` file.

Planned API: `POST /api/v1/documents/bulk-download`.

AC reference: AC-10.01.

### Category Download Permission

Permission that controls whether Member Team may download documents in a category. Head of Team
manages this permission.

Planned table: `category_download_permissions`.

AC reference: AC-13.01.

### Active Download Permission

State where a category allows Member Team download.

### Inactive Download Permission

State where a category blocks Member Team download. Newly auto-created categories default to
inactive until Head of Team enables them.

### Signed URL

Time-limited URL for object access. Signed URLs must use bounded TTL and must not be logged.

### Object Key

Internal storage path of a file in S3-compatible storage. Object keys must not be exposed as an
authorization substitute.

---

## 5. Roles and Access

### Member Team

BA persona who uploads documents, searches, filters, previews, and downloads documents when category
permission allows it.

Planned role code: `member_team`.

### Head of Team

BA persona who monitors document usage, reviews download audit activity, and controls category
download permission.

Planned role code: `head_of_team`.

### RBAC

Role-Based Access Control. Axentra must enforce RBAC in the API, not only in the Web navigation.

### Authentication

Login/session capability. Deferred in Foundation v1.0.0 and required before protected business APIs
are exposed.

### Authorization

Server-side decision that checks user, role, resource, operation, and category permission.

### Client Route Gating

Frontend route hiding based on role. This is only a user-experience layer and must not replace
server-side authorization.

---

## 6. Analytics and Audit

### Analytics Dashboard (`"Dasbor Analitik"`)

Head of Team view showing usage metrics.

Planned API: `GET /api/v1/analytics/summary`.

### Total Documents

Metric showing the total number of documents in Axentra.

AC reference: AC-11.01.

### Last 7 Days Uploads

Metric showing documents uploaded in the last 7 days.

AC reference: AC-11.02.

### Audit Trail

Operational record of important user actions. In BA scope, the critical audit view is download
tracking.

### Download Audit Trail

Log showing who downloaded which document and when.

Planned table: `download_audit_events`. Planned API: `GET /api/v1/audit/downloads`.

AC reference: AC-12.01.

### Incident Note

Operational record written when an object, document, permission, or data exposure incident is
handled.

---

## 7. System and Technical Terminology

### Foundation

Engineering base implemented before business modules: workspace, Web, API, Worker, config,
storage, queue, database boundary, health checks, CI, and docs.

### Web

Browser application under `apps/web`. Built with React, Vite, and TanStack Query.

### API

Hono HTTP process under `apps/api`.

### Worker

Queue consumer under `apps/worker`. Handles background jobs such as processing and technical health
checks.

### MVP (Model-View-Presenter)

Frontend organization pattern. Feature files are split into `.api.ts`, `.presenter.ts`, and
`.view.tsx`.

### Bun

JavaScript/TypeScript runtime and package manager used by Axentra.

### Hono

HTTP framework used by the API process.

### Drizzle ORM

Database schema and query boundary used by `packages/db`.

### PostgreSQL

Primary relational database.

### Redis

Queue transport and readiness dependency.

### BullMQ

Queue framework used by Worker.

### MinIO

Local S3-compatible object storage provider.

### S3-Compatible Storage

Provider-neutral object storage used for document binaries.

### Storage Adapter

Provider-neutral contract in `packages/storage` for writing, reading, and signing object access.

### Liveness

Process-only health check. Implemented endpoint: `GET /api/v1/health`.

### Readiness

Dependency-aware health check. Implemented endpoint: `GET /api/v1/health/ready`.

### Correlation ID

Request identifier used to connect logs across Web/API/Worker boundaries.

### Redaction

Removing sensitive values from logs, including credentials, signed URLs, tokens, object keys when
needed, and document content.

### CI Gate

Automated verification run in CI. Current foundation gate includes type-check, lint, format, tests,
and build.

### Complete Check

Local full verification command:

```powershell
bun run complete-check
```

---

## 8. Status Values Reference

### Implementation Status

| Value         | Meaning                                                |
| ------------- | ------------------------------------------------------ |
| `Implemented` | Exists in code and is covered by verification.         |
| `Planned`     | Approved or expected but not implemented yet.          |
| `Deferred`    | Intentionally postponed outside Foundation v1.0.0.     |
| `Blocked`     | Cannot proceed until dependency or decision is solved. |

### Processing Status

Planned values for document enrichment:

| Value        | Meaning                                       |
| ------------ | --------------------------------------------- |
| `queued`     | Processing job has been queued.               |
| `processing` | Worker is extracting or classifying content.  |
| `completed`  | Metadata, tags, category, and index are done. |
| `failed`     | Processing failed and may need retry.         |

### Category Download Permission Status

| Value      | Meaning                                             |
| ---------- | --------------------------------------------------- |
| `active`   | Member Team may download documents in category.     |
| `inactive` | Member Team may not download documents in category. |

### Document Access Outcome

| Outcome       | Meaning                                       |
| ------------- | --------------------------------------------- |
| `allowed`     | Current user may perform the action.          |
| `denied`      | User, role, or category permission blocks it. |
| `not_found`   | Document does not exist or is hidden.         |
| `expired`     | Signed URL or temporary access expired.       |
| `unsupported` | File type or action is not supported.         |
| `duplicate`   | Content already exists in Axentra.            |

---

## 9. Code-to-UI Mapping

Quick reference for turning English code names into Bahasa Indonesia or product UI labels.

| Code or concept                 | UI label or business phrase             |
| ------------------------------- | --------------------------------------- |
| `document`                      | `"Dokumen"`                             |
| `documents`                     | `"Dokumen"`                             |
| `filename`                      | `"Nama File"`                           |
| `original_format`               | `"Format Asli"`                         |
| `upload`                        | `"Unggah"`                              |
| `uploaded_at`                   | `"Tanggal Upload"`                      |
| `uploaded_by`                   | `"Diunggah Oleh"`                       |
| `recent_documents`              | `"Dokumen Terbaru"`                     |
| `metadata`                      | `"Metadata"`                            |
| `author`                        | `"Penulis"`                             |
| `smart_tags`                    | `"Smart Tags"` or `"Tag Otomatis"`      |
| `top_tags`                      | `"Top Tags"`                            |
| `category`                      | `"Kategori"`                            |
| `auto_category`                 | `"Kategori Otomatis"`                   |
| `search`                        | `"Pencarian"`                           |
| `search_query`                  | `"Kata Kunci"`                          |
| `search_snippet`                | `"Cuplikan"`                            |
| `related_documents`             | `"Dokumen Terkait"`                     |
| `preview`                       | `"Preview"`                             |
| `download`                      | `"Download"` or `"Unduh"`               |
| `bulk_download`                 | `"Download Massal"` or `"Unduh Massal"` |
| `.zip` output                   | `"File ZIP"`                            |
| `download_permission`           | `"Hak Download"`                        |
| `category_download_permissions` | `"Perizinan Download Kategori"`         |
| `download_audit_events`         | `"Audit Download"`                      |
| `analytics_summary`             | `"Ringkasan Analitik"`                  |
| `total_documents`               | `"Total Dokumen"`                       |
| `uploads_last_7_days`           | `"Unggahan 7 Hari Terakhir"`            |
| `member_team`                   | `"Member Team"`                         |
| `head_of_team`                  | `"Head of Team"`                        |
| `File diterima untuk diproses`  | Accepted upload message                 |
| `File ini sudah ada`            | Duplicate warning message               |
| unsupported file feedback       | `"Format file tidak didukung"`          |
| no-result state                 | `"Dokumen tidak ditemukan"`             |
