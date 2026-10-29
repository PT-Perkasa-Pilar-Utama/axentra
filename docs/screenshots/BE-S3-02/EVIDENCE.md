# Evidence: BE-S3-02 - Download authorization (denial) and head toggle

Run: 2026-10-27, branch FND-10-Resolve-sprint-1-3-partials-and-blockers, Playwright MCP (Chromium), manual flows per docs/E2E_TESTING.md sections 3-6.
Diverifikasi pada SHA: belum (lihat catatan)

Catatan SHA: run ini tidak mencatat SHA commit. Ulangi alur pada SHA final sebelum rilis, lalu catat SHA di sini.

Stale statement: the first record quotes the UI note "Anda tidak memiliki izin mengunduh dokumen ini." after pressing Download. During that run the Web app ignored `canDownload`, so the button stayed enabled and the click ended in the 403. The Web app now reads `canDownload` from `GET /documents/:id`. For a category with download disabled, the detail view disables the button before any click and shows `DOWNLOAD_ACCESS_DENIED_MESSAGE` ("Akses unduh tidak diizinkan untuk kategori dokumen ini"), the same text the API returns in the 403 body. The FE-S3-02 re-check records that state. The 403 body in the first record is still the API contract. The UI note and the click flow need a repeat on the committed SHA. Usang: perlu diverifikasi ulang pada SHA final.

Setup deviations (recorded for the Tech Lead):

- Web runs on port 5174 (Vite --strictPort). Port 5173 was already held by an unrelated bun process (not touched).
- Seeded users were created by db:seed in the E2E DB. Their plaintext passwords are not in the repo, so the run used a shell-level override of AUTH_LOCAL_IDENTITY_DIRECTORY with generated test passwords. .env and the repo were not modified.
- The E2E DB category download flag was changed for the denial and enable steps (see BE-S3-02 and FE-S3-02).
- Playwright could only read/write files under its allowed root, so fixtures were copied there for the run and removed afterwards.

```text
AC:          AC-13.01 precondition (denial)
Card:        BE-S3-02
Environment: local E2E stack: Web http://localhost:5174, API http://localhost:3001, worker queue axentra-jobs, DB axentra_e2e_test (127.0.0.1:15432), Redis 127.0.0.1:16379, MinIO 127.0.0.1:19000
Role:        member_team (member@axentra.internal)
Input:       E2E DB: category Reporting download_enabled = false. member_team presses Download on report-api.pdf
Expected:    Download denied with 403 copy; no file
Observed:    HTTP 403 body {"code":"FORBIDDEN","message":"Akses unduh tidak diizinkan untuk kategori dokumen ini"}; UI note "Anda tidak memiliki izin mengunduh dokumen ini."; button disabled; no download event
Result:      Pass
Screenshot:  docs/screenshots/BE-S3-02/download-denied-403.png
Note:        Setting restored to true afterwards (its value before this check). Usang: perlu diverifikasi ulang pada SHA final. UI note pada baris Observed ("Anda tidak memiliki izin mengunduh dokumen ini.") tidak sama dengan DOWNLOAD_ACCESS_DENIED_MESSAGE.
```

```text
AC:          AC-13.01
Card:        BE-S3-02
Environment: local E2E stack: Web http://localhost:5174, API http://localhost:3001, worker queue axentra-jobs, DB axentra_e2e_test (127.0.0.1:15432), Redis 127.0.0.1:16379, MinIO 127.0.0.1:19000
Role:        head_of_team (head@axentra.internal)
Input:       Head of Team toggles the category download permission in the UI
Expected:    Toggle present and effective
Observed:    Not run. apps/web has no category-permission UI (only the API side exists)
Result:      Blocked
Screenshot:  No screenshot
Note:        Dependency missing: Web UI for the permission toggle.
```
