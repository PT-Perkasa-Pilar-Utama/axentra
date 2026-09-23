# Processing API

Source: BA user stories US-03, US-04, US-05.

## Endpoints Summary

| Endpoint                           | Method | Status      | Task                |
| ---------------------------------- | ------ | ----------- | ------------------- |
| `/api/v1/documents/:id/metadata`   | GET    | Implemented | BE-S1-05 (Sprint 1) |
| `/api/v1/documents/:id/smart-tags` | GET    | Planned     | US-04 (Sprint 2)    |
| `/api/v1/documents/:id/category`   | GET    | Planned     | US-05 (Sprint 2)    |

---

## 1. Document Metadata API

### `GET /api/v1/documents/:id/metadata`

Retrieves extracted document metadata, including author, extraction timestamp, and raw extractor payload.

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

## 2. Processing Lifecycle & Queue Integration

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
   - **PDF:** Extracts author from PDF Info dictionary (`/Author (...)` or hex-encoded `/Author <...>`).
   - **DOCX:** Safely parses ZIP Central Directory, locates `docProps/core.xml`, decompresses raw DEFLATE bytes with bounded size (512 KiB limit), and parses `<dc:creator>` or `<cp:lastModifiedBy>`.
   - **Fallback:** Deterministic `null` when no author metadata is detected.
4. **Atomic Persistence & Completion:** Extracted metadata upsert into `document_metadata` and the document status transition to `'completed'` execute inside a single atomic database transaction (`db.transaction`). If any write fails, both are rolled back, and the document is marked as `'failed'` with `error_message`.
5. **Terminal State:** On successful completion, `documents.processing_status` becomes `'completed'` and `errorMessage` is cleared. On failure, status is updated to `'failed'` with `error_message`.

Accepted uploads enqueue `document.process` with `jobId` equal to the document id. If the queue rejects the job, the API returns `503 PROCESSING_UNAVAILABLE` and marks the document `failed` with `Antrean pemrosesan dokumen tidak tersedia`. The worker scans that exact failure at startup and every 30 seconds, enqueues the missing job idempotently, and returns the document to `queued`. The job then moves it through `processing` to `completed`.

---

## 3. Planned Endpoints (Future Sprints)

### Smart Tags (`GET /api/v1/documents/:id/smart-tags`) — Planned US-04

- Generates relevant Smart Tags from document content (max 3 tags per document).

### Auto Category (`GET /api/v1/documents/:id/category`) — Planned US-05

- Assigns category based on document content.

---

## 4. Processing State Vocabulary

Persisted `processing_status` enum across database, queue, API, and Web:

- `queued`: Upload accepted and queued for worker processing.
- `processing`: Worker is currently extracting metadata and tags.
- `completed`: Processing succeeded; metadata and tags persisted.
- `failed`: Processing failed; `error_message` records cause.
