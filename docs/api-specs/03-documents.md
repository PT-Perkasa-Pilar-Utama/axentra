# Documents API

Source: BA user stories US-01, US-02, US-03, US-07, US-08, US-09, US-10.

These APIs are planned and not implemented in Foundation v0.1.0.

## Planned Endpoints

```text
GET  /api/v1/documents
POST /api/v1/documents/upload
POST /api/v1/documents/check-duplicate
GET  /api/v1/documents/:id
GET  /api/v1/documents/:id/preview
GET  /api/v1/documents/:id/download
POST /api/v1/documents/bulk-download
GET  /api/v1/documents/:id/related
```

## Recent Document List

### `GET /api/v1/documents`

Status: Implemented (BE-S1-06).

Returns documents that have a stored file, newest `created_at` first. Soft-deleted documents are omitted. Sprint 1 items do not include `tags` or `category`.

**Authorization:**

- Requires authenticated session (`Bearer <token>`).
- Allows `member_team` and `head_of_team`.

**Query:**

- `page` — integer, default `1`, minimum `1`, maximum `1000`.
- `limit` — integer, default `20`, minimum `1`, maximum `100`.

**Success Response (`200 OK`):**

```json
{
  "success": true,
  "data": [
    {
      "id": "11111111-1111-4111-8111-111111111111",
      "filename": "laporan.pdf",
      "processingStatus": "completed",
      "createdAt": "2026-09-22T00:00:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 1
  }
}
```

`processingStatus` is `queued`, `processing`, `completed`, or `failed`. `filename` is `document_files.original_name`.

**Error Responses:**

- `400 VALIDATION_ERROR`: `page` or `limit` is not an integer inside the bounds above.
- `401 UNAUTHORIZED`: Missing or rejected bearer token.

## Upload

### `POST /api/v1/documents/upload`

Status: Implemented (BE-S1-02).

**Authorization:**

- Requires authenticated session (`Bearer <token>`).
- Enforces role `member_team`. Head of Team is rejected with `403 FORBIDDEN`.

**Request:**

- `Content-Type: multipart/form-data`
- Body field: `files` (one or more binary file parts). Also accepts `file`.

**Constraints:**

- Supported formats: PDF (`.pdf`), DOCX (`.docx`).
- Single PDF only per upload batch.
- Up to 10 DOCX files per upload batch.
- Mixing PDF and DOCX in a single batch is rejected (`400 VALIDATION_ERROR`).
- Maximum file size: 50 MB per file, 50 MB aggregate per request (`413 PAYLOAD_TOO_LARGE`).
- Non-empty files only (`400 VALIDATION_ERROR`).
- Content hash duplicate check: rejects duplicate content with `409 DUPLICATE_DOCUMENT` (`"File ini sudah ada"`).

**Success Response (`200 OK`):**

```json
{
  "success": true,
  "data": {
    "message": "File diterima untuk diproses",
    "count": 1,
    "files": [
      {
        "filename": "laporan.pdf",
        "size": 1048576,
        "documentType": "pdf"
      }
    ]
  }
}
```

**Error Responses:**

- `400 VALIDATION_ERROR` / `UNSUPPORTED_FILE_TYPE`: Invalid request, unsupported extension/MIME, mixed types, or exceeded batch limit.
- `401 UNAUTHORIZED`: Missing, forged, or expired bearer token.
- `403 FORBIDDEN`: Non-member role (e.g. `head_of_team`).
- `409 DUPLICATE_DOCUMENT`: Content identical to existing document or intra-batch duplicate.
- `413 PAYLOAD_TOO_LARGE`: Individual or aggregate size exceeds 50 MB.

#### Constraints and Limits

- **Role required**: `member_team` (`401 Unauthorized` if unauthenticated, `403 Forbidden` if wrong role).
- **Single file limit**: Maximum 50 MB (`MAX_DOCUMENT_FILE_SIZE_BYTES = 52_428_800` bytes). Rejection status `413 Payload Too Large`.
- **Aggregate upload limit**: Maximum 50 MB per request (`MAX_AGGREGATE_UPLOAD_SIZE_BYTES = 52_428_800` bytes). Rejection status `413 Payload Too Large`.
- **Batch limit (DOCX)**: Maximum 10 DOCX files per upload (`MAX_DOCX_BATCH_COUNT = 10`). Rejection status `400 Bad Request`.
- **PDF constraint**: Single PDF only per upload (`400 Bad Request` if multiple PDFs are uploaded).
- **No mixed types**: Cannot mix PDF and DOCX in a single upload request (`400 Bad Request`).
- **Allowed formats**:
  - PDF: Extension `.pdf`, MIME `application/pdf`, header magic bytes `%PDF-`.
  - DOCX: Extension `.docx`, MIME `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, OOXML zip structure (`[Content_Types].xml` or `word/`).
- **Unsupported formats**: All other extensions (e.g. `.jpg`, `.png`, `.txt`) return `415 Unsupported Media Type` with message `Tipe file tidak didukung`.

## Duplicate Check

### `POST /api/v1/documents/check-duplicate`

Planned behavior:

- Compare uploaded content, not only filename.
- Return duplicate warning `File ini sudah ada`.
- Prevent duplicate file persistence.
- Allow non-duplicate uploads even when another document exists.

## Detail and Metadata

### `GET /api/v1/documents/:id`

Planned response includes:

- Filename.
- Original format.
- Extracted metadata such as author.
- Smart Tags.
- Auto category.
- Preview availability.
- Download permission state.

## Preview and Download

### `GET /api/v1/documents/:id/preview`

Shows document content without downloading the original file.

### `GET /api/v1/documents/:id/download`

Downloads original file format when the current user has permission.

### `POST /api/v1/documents/bulk-download`

Accepts selected document IDs and returns or starts one `.zip` download.

## Related Documents

### `GET /api/v1/documents/:id/related`

Returns documents that share at least one Smart Tag with the current document.

## Authorization Rules

- Member Team can preview and download only when category permission allows it.
- Newly auto-created categories start without download permission.
- Head of Team controls category download permission.
