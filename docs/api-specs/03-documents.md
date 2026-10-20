# Documents API

Source: BA user stories US-01, US-02, US-03, US-07, US-08, US-09, US-10.

These APIs are planned and not implemented in Foundation v1.0.0.

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

Returns documents that have a stored file, newest `created_at` first. Soft-deleted documents are omitted. Supports single-tag and multi-tag filtering (AND logic per AC-04.03, AC-04.04).

**Authorization:**

- Requires authenticated session (`Bearer <token>`).
- Allows `member_team` and `head_of_team`.

**Query:**

- `page` — integer, default `1`, minimum `1`, maximum `1000`.
- `limit` — integer, default `20`, minimum `1`, maximum `100`.
- `tags` — string or repeated array, maximum 20 tags. Filters documents containing all specified tags (AND logic).
- `tag` — string, single tag alias for `tags`.

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
- `503 PROCESSING_UNAVAILABLE`: One or more stored files in the batch could not be placed on the processing queue. The queue command is bounded by `REDIS_HEALTH_TIMEOUT_MS`, so an unavailable Redis returns this response instead of waiting indefinitely. The error message is `Antrean pemrosesan dokumen tidak tersedia`. `error.details` lists every persisted file: `field` is the document id and `message` is `queued <filename>` or `failed <filename>`. `queued` means that file already has a runnable job. `failed` means that file was not enqueued and is marked failed with the same message. If that status write also fails, the API returns `500` and those rows stay `queued`, where recovery still finds them. The worker re-enqueues both states, replaces a retained completed or failed queue job, and processing then reaches `completed` or a non-enqueue `failed` state. A `200` means every file in the batch has a runnable queue job. Retrying the same bytes returns `409 DUPLICATE_DOCUMENT`; use the document ids in `details` to reconcile the original request.

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

Status: Implemented (BE-S3-01).

Shows document content without downloading the original file by issuing a bounded signed URL for the
stored file. The object key is never returned as a response field and signed URLs are never logged.

**Authorization:**

- Requires authenticated session (`Bearer <token>`).
- Allowed roles: `member_team`, `head_of_team`, `admin`.
- Preview is not gated by category download permission; that permission controls
  `GET /documents/:id/download` only.

**Parameters:**

- `id` (path, required) — UUID of the target document.

**Success Response (`200 OK`):**

```json
{
  "success": true,
  "data": {
    "previewUrl": "https://storage.local/documents/11111111-1111-4111-8111-111111111111/laporan.pdf?...",
    "filename": "laporan.pdf",
    "mimeType": "application/pdf",
    "fileSize": 1048576,
    "expiresInSeconds": 300
  }
}
```

`previewUrl` is a bounded signed URL (`PREVIEW_URL_TTL_SECONDS = 300`). PDF content renders inline in
the browser; for DOCX the Web viewer decides how to render or fall back. Preview does not write a
download audit event.

**Error Responses:**

- `400 VALIDATION_ERROR`: `id` is not a valid UUID.
- `401 UNAUTHORIZED`: Missing, forged, or expired token.
- `404 NOT_FOUND`: Document not found, soft-deleted, or stored file record not found.

### `GET /api/v1/documents/:id/download`

Status: Implemented (BE-S3-02).

Downloads original file format when the current user has permission. Supports issuing a bounded signed URL or streaming the file directly.

**Authorization:**

- Requires authenticated session (`Bearer <token>`).
- Allowed roles: `member_team`, `head_of_team`, `admin`.
- **Category Permission Recheck:**
  - `member_team`: Can download only when the document belongs to a category with `download_enabled = true`. Returns `403 FORBIDDEN` if uncategorized or permission is disabled.
  - `head_of_team` & `admin`: Download is permitted.
- **Audit Logging:** Every successful download records a point-in-time fact in `download_audit_events` (`userId`, `userName`, `userEmail`, `documentId`, `documentName`, `downloadedAt`). Denied or failed requests do not write audit records.

**Parameters:**

- `id` (path, required) — UUID of the target document.

**Query:**

- `stream` (query, optional) — boolean (`true` / `1`). If true or if request header `Accept: application/octet-stream` is sent, returns the binary file stream directly.
- `expiresInSeconds` (query, optional) — integer between `60` and `900`, default `300`. Bounded TTL for the signed URL.

**Success Response (`200 OK` - Default JSON mode):**

```json
{
  "success": true,
  "data": {
    "downloadUrl": "https://storage.local/documents/11111111-1111-4111-8111-111111111111/laporan.pdf?...",
    "filename": "laporan.pdf",
    "mimeType": "application/pdf",
    "fileSize": 1048576,
    "expiresInSeconds": 300
  }
}
```

**Success Response (`200 OK` - Stream mode):**

- Status: `200 OK`
- Headers:
  - `Content-Type: <mimeType>`
  - `Content-Disposition: attachment; filename="<filename>"; filename*=UTF-8''<safeFilename>`
  - `Content-Length: <fileSize>`
- Body: Binary file bytes.

**Error Responses:**

- `400 VALIDATION_ERROR`: `id` is not a valid UUID or `expiresInSeconds` outside bounds [60, 900].
- `401 UNAUTHORIZED`: Missing, forged, or expired token.
- `403 FORBIDDEN`: Category permission disabled or document uncategorized for `member_team` (`"Akses unduh tidak diizinkan untuk kategori dokumen ini"`).
- `404 NOT_FOUND`: Document not found, soft-deleted, or stored file record not found.
- `500 INTERNAL_ERROR`: Storage failure, file size mismatch with metadata (stream mode only), the audit write failing, or unexpected server error (`"Terjadi kesalahan pada server"`). Such requests write no audit record, and neither the signed URL nor the file bytes are returned.

### `POST /api/v1/documents/bulk-download`

Status: Implemented (BE-S3-03).

Accepts selected document IDs, validates existence, enforces category download permissions per item, combines files into a single `.zip` archive, and records download audit events for each document.

**Authorization:**

- Requires authenticated session (`Bearer <token>`).
- Allowed roles: `member_team`, `head_of_team`, `admin`.
- **Category Permission Recheck per Document:**
  - `member_team`: Every requested document must belong to a category with `download_enabled = true`. Returns `403 FORBIDDEN` (`"Akses unduh tidak diizinkan untuk kategori dokumen ini"`) if any document is uncategorized or its category download permission is disabled.
  - `head_of_team` & `admin`: Download is permitted.
- **Audit Logging:** Every successful bulk download records a point-in-time fact in `download_audit_events` for each document (`userId`, `userName`, `userEmail`, `documentId`, `documentName`, `downloadedAt`). Denied or failed requests do not write audit records.

**Request (`application/json`):**

```json
{
  "documentIds": ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"]
}
```

**Constraints:**

- `documentIds` — array of valid UUID strings.
- Minimum 1 document (`400 VALIDATION_ERROR`: `"Minimal satu dokumen harus dipilih"`).
- Maximum 100 documents (`400 VALIDATION_ERROR`: `"Maksimal 100 dokumen per unduhan massal"`).
- Maximum total aggregate size: 250 MB (`262,144,000` bytes) across all requested documents (`413 PAYLOAD_TOO_LARGE`: `"Total ukuran dokumen melebihi batas maksimum unduhan massal (250 MB)"`).
- Duplicate document IDs in the request are automatically deduplicated.
- If multiple documents share the same original filename, entry filenames inside the `.zip` archive are disambiguated (e.g. `laporan.pdf`, `laporan (1).pdf`).
- Entry filenames inside the archive are sanitized to prevent directory traversal (`../`, `..\`, absolute paths).

**Success Response (`200 OK`):**

- Status: `200 OK`
- Headers:
  - `Content-Type: application/zip`
  - `Content-Disposition: attachment; filename="axentra-documents.zip"; filename*=UTF-8''axentra-documents.zip`
  - `Content-Length: <fileSize>`
- Body: Binary ZIP archive bytes containing all requested files.

**Error Responses:**

- `400 VALIDATION_ERROR`: Missing/invalid JSON body, invalid UUIDs, empty `documentIds`, or exceeding 100 documents.
- `401 UNAUTHORIZED`: Missing, forged, or expired token.
- `403 FORBIDDEN`: Category download permission disabled or document uncategorized for `member_team` (`"Akses unduh tidak diizinkan untuk kategori dokumen ini"`).
- `404 NOT_FOUND`: One or more requested documents not found, soft-deleted, or lacking a stored file record.
- `413 PAYLOAD_TOO_LARGE`: Total aggregate size of selected documents exceeds 250 MB (`"Total ukuran dokumen melebihi batas maksimum unduhan massal (250 MB)"`).
- `429 TOO_MANY_REQUESTS`: Concurrency queue capacity exceeded (`"Terlalu banyak permintaan unduhan massal secara bersamaan, antrean penuh"`).
- `500 INTERNAL_ERROR`: Storage retrieval failure, file size mismatch with metadata, the audit write failing, or unexpected server error (`"Terjadi kesalahan pada server"`). Requests encountering storage or audit failures do not write audit records, and no archive is returned.

> **Approver Architectural Decision (Arya Isnaidi, Tech Lead — 21 Oktober 2026 / Disempurnakan 22 Oktober 2026):**
>
> 1. **Prefetch Storage & Zero-Audit on Failure (F12, F17):** Endpoint melakukan prefetch seluruh objek dokumen dari storage dan memverifikasi integritas ukuran sebelum membuat ZIP archive, menulis audit event, atau mengirim response. Jika storage gagal atau ukuran tidak sesuai, endpoint mengembalikan `500 INTERNAL_ERROR` tanpa catatan audit. Follow-up untuk menyelaraskan urutan audit pada single download (`download.operations.ts`) dialokasikan ke pemilik kartu BE-S3-04.
> 2. **Pengendalian Memori Konkurensi & Siklus Hidup Respons (F7, F10, F24, F25, F27):** Batas payload 250 MB dipertahankan dengan penerapan global async semaphore (`BulkDownloadSemaphore`, `maxConcurrency: 2`, `maxQueueLength: 10`) yang berlaku per instans proses API. Slot semaphore di-acquire sebelum prefetch dan dipertahankan sepanjang transmisi chunked `ReadableStream` sampai klien selesai membaca body, koneksi dibatalkan (`cancel`/`abort`), atau batas waktu transfer (60 detik) tercapai, mencegah akumulasi buffer arsip di memori proses saat terjadi lonjakan permintaan paralel.
> 3. **Pengecualian Ruang Lingkup Dependensi (F23):** Pembaruan dependensi `hono` (4.13.11) dan `vite` (7.3.7) pada commit `e7455aa` disetujui sebagai pengecualian ruang lingkup (scope exception) yang sah dalam PR ini demi resolusi peringatan keamanan audit tanpa menunggu siklus maintenance terpisah.
> 4. **Urutan Penggabungan Cabang (Merge Order):** Cabang `BE-S3-03` digabungkan terlebih dahulu ke `dev`. Pemilik kartu `BE-S3-04` akan melakukan rebase setelahnya untuk menyelesaikan konflik teks pada `download.repository.ts` dan berkas tes integrasi terkait.

## Related Documents

### `GET /api/v1/documents/:id/related`

Returns documents that share at least one Smart Tag with the current document.

- Authentication: `member_team` and `head_of_team`.
- The response contains at most 20 active documents, excluding the current document, with a stored
  file and at least one matching Smart Tag. Results are ordered by newest document first, with ID as
  a stable tie-breaker.
- `sharedTags` contains only the tag names shared with the current document, sorted alphabetically.
- An active source document without Smart Tags returns an empty array.
- An invalid UUID returns `400 VALIDATION_ERROR`; a missing or deleted source document returns
  `404 NOT_FOUND`.

Success response:

```json
{
  "success": true,
  "data": [
    {
      "id": "11111111-1111-4111-8111-111111111111",
      "filename": "laporan-tahunan.pdf",
      "processingStatus": "completed",
      "createdAt": "2026-09-22T02:00:00.000Z",
      "sharedTags": ["keuangan", "tahunan"]
    }
  ]
}
```

## Authorization Rules

- Preview is available to Member Team, Head of Team, and Admin for active documents; it is not
  gated by category download permission.
- Member Team can download only when category permission allows it.
- Newly auto-created categories start without download permission.
- Head of Team controls category download permission.
