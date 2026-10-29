# Evidence: FE-S3-01 - Inline preview

Run: 2026-10-27, branch FND-10-Resolve-sprint-1-3-partials-and-blockers, Playwright MCP (Chromium), manual flows per docs/E2E_TESTING.md sections 3-6.
Diverifikasi pada SHA: a02dd05

Catatan SHA: Alur walkthrough diverifikasi pada commit a02dd05 (Bun 1.4.3).

Coverage: PDF and text-only DOCX. Konfirmasi BA dan Tech Lead menyetujui pratinjau DOCX berupa teks saja untuk AC-08.01 (F12).

Superseded: the first record and its screenshot `inline-preview.png` show an iframe that loaded a presigned object-storage URL. Re-run di bawah menggantikannya (proxy API byte streaming). Diverifikasi pada commit a02dd05.

Setup deviations (recorded for the Tech Lead):

- Web runs on port 5174 (Vite --strictPort). Port 5173 was already held by an unrelated bun process (not touched).
- Seeded users were created by db:seed in the E2E DB. Their plaintext passwords are not in the repo, so the run used a shell-level override of AUTH_LOCAL_IDENTITY_DIRECTORY with generated test passwords. .env and the repo were not modified.
- The E2E DB category download flag was changed for the denial and enable steps (see BE-S3-02 and FE-S3-02).
- Playwright could only read/write files under its allowed root, so fixtures were copied there for the run and removed afterwards.

```text
AC:          AC-08.01
Card:        FE-S3-01
Environment: local E2E stack: Web http://localhost:5174, API http://localhost:3001, worker queue axentra-jobs, DB axentra_e2e_test (127.0.0.1:15432), Redis 127.0.0.1:16379, MinIO 127.0.0.1:19000
Role:        member_team (member@axentra.internal)
Input:       Open detail page (preview) of report-api.pdf
Expected:    Whole document shown inline in the viewer without a download
Observed:    The viewer iframe renders the PDF page with text "API reporting strategy overview"; no download event was fired
Result:      Pass
Screenshot:  docs/screenshots/FE-S3-01/inline-preview.png (superseded)
Note:        The iframe src was a presigned object-storage URL, which gives the browser a storage URL. The re-run below replaces this record.
```

## Re-run 2026-10-27: preview served through the API proxy

Supersedes the presigned-URL note above. The iframe now uses a `blob:` URL built from bytes fetched through the API.

```text
AC:          AC-08.01
Card:        FE-S3-01
Environment: local E2E stack: Web http://localhost:5174, API http://localhost:3001, worker queue axentra-jobs, DB axentra_e2e_test (127.0.0.1:15432), Redis 127.0.0.1:16379, MinIO 127.0.0.1:19000
Role:        member_team (member.e2e@axentra.test)
Input:       Detail page of e2e-alpha-contract.pdf (category Contract)
Expected:    Whole PDF shown inline; no object key, storage key, or presigned URL in the browser; Download disabled when canDownload is false
Observed:    Iframe src is a blob: URL and renders the text "Contract agreement for vendor services. Payment terms net 30." GET /documents/:id/preview returns {filename, mimeType, fileSize} only. GET /documents/:id/preview/content returns 200 with Content-Type application/pdf, Content-Disposition inline (filename and filename*), X-Content-Type-Options nosniff, Cache-Control private, no-store, Content-Length 636, body starting with %PDF-. The detail response and content headers contain no objectKey, storageKey, downloadUrl, previewUrl, X-Amz, or Signature. Download is disabled with "Akses unduh tidak diizinkan untuk kategori dokumen ini".
Result:      Pass
Screenshot:  docs/screenshots/FE-S3-01/preview-inline-rerun-2026-10-27.png
```
