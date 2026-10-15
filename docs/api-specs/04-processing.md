# Processing API

Source: BA user stories US-03, US-04, US-05.

## Endpoints Summary

| Endpoint                           | Method | Status      | Task                |
| ---------------------------------- | ------ | ----------- | ------------------- |
| `/api/v1/documents/:id/metadata`   | GET    | Implemented | BE-S1-05 (Sprint 1) |
| `/api/v1/documents/:id/smart-tags` | GET    | Implemented | BE-S2-01 (Sprint 2) |
| `/api/v1/documents/:id/category`   | GET    | Implemented | BE-S2-04 (Sprint 2) |

---

## 1. Document Metadata API

### `GET /api/v1/documents/:id/metadata`

Retrieves extracted document metadata, including author, extraction timestamp, and raw extractor payload.

- **Status:** Implemented (BE-S1-05 / Sprint 1)
- **Authorization:** Bearer token required. Allowed roles: `member_team`, `head_of_team`.
- **Path Parameters:**
  - `id` (string, UUID): Valid UUID identifying the document.

#### Success Response (`200 OK`)

```json
{
  "success": true,
  "data": {
    "id": "11111111-1111-4111-8111-111111111111",
    "documentId": "22222222-2222-4222-8222-222222222222",
    "author": "Dr. Siti Rahma",
    "rawMetadata": {
      "extractor": "worker-deterministic",
      "method": "docx_xml_core",
      "detected": true
    },
    "extractedAt": "2026-09-21T05:30:00.000Z",
    "createdAt": "2026-09-21T05:30:00.000Z",
    "updatedAt": "2026-09-21T05:30:00.000Z"
  }
}
```

#### Error Responses

- **`400 Bad Request`** (`VALIDATION_ERROR`):
  ```json
  {
    "success": false,
    "error": {
      "code": "VALIDATION_ERROR",
      "message": "ID dokumen harus berupa UUID yang valid"
    }
  }
  ```
- **`401 Unauthorized`** (`UNAUTHORIZED`): Token is missing or invalid.
- **`403 Forbidden`** (`FORBIDDEN`): User role is not permitted.
- **`404 Not Found`** (`NOT_FOUND`):
  - When document does not exist: `"Dokumen tidak ditemukan"`
  - When document exists but metadata is not yet extracted: `"Metadata dokumen tidak ditemukan"`

---

## 2. Document Smart Tags API

### `GET /api/v1/documents/:id/smart-tags`

Retrieves system-generated Smart Tags associated with a document (max 3 tags per document, per AC-04.02).

- **Status:** Implemented (BE-S2-01 / Sprint 2)
- **Authorization:** Bearer token required. Allowed roles: `member_team`, `head_of_team`.
- **Path Parameters:**
  - `id` (string, UUID): Valid UUID identifying the document.

#### Success Response (`200 OK`)

```json
{
  "success": true,
  "data": [
    {
      "id": "33333333-3333-4333-8333-333333333333",
      "name": "finance",
      "createdAt": "2026-09-21T05:30:00.000Z"
    },
    {
      "id": "44444444-4444-4444-8444-444444444444",
      "name": "strategy",
      "createdAt": "2026-09-21T05:30:00.000Z"
    }
  ]
}
```

- When the document exists but has no Smart Tags generated yet or is still processing, returns `"data": []`.

#### Error Responses

- **`400 Bad Request`** (`VALIDATION_ERROR`):
  ```json
  {
    "success": false,
    "error": {
      "code": "VALIDATION_ERROR",
      "message": "ID dokumen harus berupa UUID yang valid"
    }
  }
  ```
- **`401 Unauthorized`** (`UNAUTHORIZED`): Token is missing or invalid.
- **`403 Forbidden`** (`FORBIDDEN`): User role is not permitted.
- **`404 Not Found`** (`NOT_FOUND`):
  - When document does not exist or has been deleted: `"Dokumen tidak ditemukan"`

---

## 3. Document Category API

### `GET /api/v1/documents/:id/category`

Retrieves the auto-assigned category for a document (AC-05.01, AC-05.02).

- **Status:** Implemented (BE-S2-04 / Sprint 2)
- **Authorization:** Bearer token required. Allowed roles: `member_team`, `head_of_team`.
- **Path Parameters:**
  - `id` (string, UUID): Valid UUID identifying the document.

#### Success Response (`200 OK`)

When document has an assigned category:

```json
{
  "success": true,
  "data": {
    "id": "55555555-5555-4555-8555-555555555555",
    "name": "Reporting",
    "slug": "reporting",
    "downloadEnabled": false,
    "createdAt": "2026-09-21T05:30:00.000Z",
    "updatedAt": "2026-09-21T05:30:00.000Z"
  }
}
```

When document exists but has no category assigned or is still processing:

```json
{
  "success": true,
  "data": null
}
```

#### Error Responses

- **`400 Bad Request`** (`VALIDATION_ERROR`):
  ```json
  {
    "success": false,
    "error": {
      "code": "VALIDATION_ERROR",
      "message": "ID dokumen harus berupa UUID yang valid"
    }
  }
  ```
- **`401 Unauthorized`** (`UNAUTHORIZED`): Token is missing or invalid.
- **`403 Forbidden`** (`FORBIDDEN`): User role is not permitted.
- **`404 Not Found`** (`NOT_FOUND`):
  - When document does not exist or has been deleted: `"Dokumen tidak ditemukan"`

---

## 4. Processing Lifecycle & Queue Integration

### Queue Job: `document.process`

- **Queue Name:** Configured via `QUEUE_NAME` (default: `axentra-jobs`).
- **Job Name:** `document.process`
- **Payload Schema:**
  ```json
  {
    "jobId": "33333333-3333-4333-8333-333333333333",
    "documentId": "22222222-2222-4222-8222-222222222222",
    "schemaVersion": 1,
    "requestedAt": "2026-09-21T05:30:00.000Z"
  }
  ```

### Processing Steps

1. **State Transition:** The worker transitions `documents.processing_status` to `'processing'`.
2. **File Loading:** Worker retrieves the `document_files` record and downloads the stored object via `StorageAdapter.getObject(storageKey)`.
3. **Extraction:**
   - **Author Metadata:** Extracts author from PDF Info dictionary (`/Author (...)` or hex-encoded) or DOCX `docProps/core.xml` (`<dc:creator>` / `<cp:lastModifiedBy>`). Deterministic `null` when no author metadata is detected.
   - **Smart Tags:** Extracts up to 3 Smart Tags from document keywords, subject, content text, or normalized filename tokens (AC-04.02).
   - **Auto Category:** Extracts category from document content text (or metadata/filename fallback), creates category if not present with default `download_enabled = false`, and assigns `category_id` (AC-05.01, AC-05.02).
4. **Atomic Persistence & Completion:** Extracted metadata upsert into `document_metadata`, smart tags insertion into `smart_tags` and links in `document_smart_tags`, auto-created category insertion into `categories` and `category_download_permissions`, and the document status transition to `'completed'` with `category_id` execute inside a single atomic database transaction (`db.transaction`). If any write fails, all are rolled back, and the document is marked as `'failed'` with `error_message`.
5. **Terminal State:** On successful completion, `documents.processing_status` becomes `'completed'` and `errorMessage` is cleared. On failure, status is updated to `'failed'` with `error_message`.

---

## 5. Processing State Vocabulary

Persisted `processing_status` enum across database, queue, API, and Web:

- `queued`: Upload accepted and queued for worker processing.
- `processing`: Worker is currently extracting metadata and tags.
- `completed`: Processing succeeded; metadata and tags persisted.
- `failed`: Processing failed; `error_message` records cause.
