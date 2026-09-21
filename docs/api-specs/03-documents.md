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

## Upload

### `POST /api/v1/documents/upload`

Planned behavior:

- Accept drag-and-drop upload from Member Team.
- Accept one PDF file.
- Accept multiple DOCX files.
- Reject unsupported files such as `.JPG`.
- Return `File diterima untuk diproses` when accepted.
- Trigger duplicate detection and processing workflow.

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
