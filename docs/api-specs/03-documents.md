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
