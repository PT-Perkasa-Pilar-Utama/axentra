# Evidence: FE-S3-01 - Inline preview

Run: 2026-10-27, branch FND-10-Resolve-sprint-1-3-partials-and-blockers, Playwright MCP (Chromium), manual flows per docs/E2E_TESTING.md sections 3-6.
Diverifikasi pada SHA: 2b5152cdcff4b971e032db648cce3a264780e74d (re-run 2026-10-29, bagian di bawah; record 2026-10-27 tidak mencatat SHA)

Catatan SHA: run ini tidak mencatat SHA commit. Ulangi alur pada SHA final sebelum rilis, lalu catat SHA di sini.

Coverage: PDF only. Neither run records a DOCX preview.

Superseded: the first record and its screenshot `inline-preview.png` show an iframe that loaded a presigned object-storage URL. The preview no longer exposes a storage URL, so the re-run below replaces that record. Do not cite `inline-preview.png` as current evidence. Usang: perlu diverifikasi ulang pada SHA final.

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

## Re-run 2026-10-29

Run: 2026-10-29, detached worktree at commit 2b5152cdcff4b971e032db648cce3a264780e74d, built-in Chromium browser pane of the Claude desktop app, manual flows per docs/E2E_TESTING.md sections 3-6. The code at this commit is identical to a66aef0, 3605cbe, and a02dd05; the evidence commit that adds this section changes only docs/screenshots.

Setup deviations (recorded for the Tech Lead):

- The Playwright MCP server failed to connect, so the built-in browser pane (Chromium) drove the Web UI.
- The browser pane has no file chooser tool. Files were attached to the upload input with a DataTransfer object; the app's change handler, client validation, and upload request ran as for a chosen file.
- Disposable stack on offset ports. Web ran on 5174 because 5173 was held by an unrelated process. Test accounts come from a generated local identity directory; passwords are not recorded.
- For AC-09.01 and AC-10.01, `category_download_permissions.download_enabled` for Reporting was set to true in the disposable DB. The Head of Team toggle is Sprint 4 scope (AC-13.01).
- Screenshots are JPEG captures of the browser pane.

```text
AC:          AC-08.01 (PDF)
Card:        FE-S3-01
Commit:      2b5152cdcff4b971e032db648cce3a264780e74d
Environment: local E2E stack: Web http://localhost:5174, API http://localhost:3001, DB axentra_test (127.0.0.1:15432), Redis 127.0.0.1:16379, MinIO 127.0.0.1:19000
Role:        member_team (member.r2@local.test)
Input:       Open detail page (preview) of report-api.pdf
Expected:    Whole document shown inline without a download; no storage URL in the browser
Observed:    PDF rendered inline from a blob: URL; requests went to /api/v1/documents/:id/preview and /preview/content; no request to object storage and no download request
Result:      Pass
Screenshot:  docs/screenshots/FE-S3-01/pdf-preview-rerun-2026-10-29.jpg
```

```text
AC:          AC-08.01 (DOCX)
Card:        FE-S3-01
Commit:      2b5152cdcff4b971e032db648cce3a264780e74d
Environment: local E2E stack: Web http://localhost:5174, API http://localhost:3001, DB axentra_test (127.0.0.1:15432), Redis 127.0.0.1:16379, MinIO 127.0.0.1:19000
Role:        member_team (member.r2@local.test)
Input:       Open detail page of sample-a.docx
Expected:    Document content shown in the viewer without a download
Observed:    Text "Sample a reporting summary for the quarterly report" shown as plain text (no layout)
Result:      Blocked
Screenshot:  docs/screenshots/FE-S3-01/docx-text-preview-rerun-2026-10-29.jpg
Note:        Text-only DOCX preview needs BA confirmation for AC-08.01 (F12).
```

Addendum 2026-10-29: BA (Azizah) confirmed on 2026-10-29 that text-only DOCX preview meets AC-08.01, relayed by Arya Isnaidi (Tech Lead). The Blocked dependency above is cleared; the observed result of this run stands and counts as Pass for AC-08.01 (DOCX). The run itself was not repeated.
