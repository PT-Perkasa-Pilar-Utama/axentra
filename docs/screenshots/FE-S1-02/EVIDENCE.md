# Evidence: FE-S1-02 - Recent list persists after refresh

Run: 2026-10-27, branch FND-10-Resolve-sprint-1-3-partials-and-blockers, Playwright MCP (Chromium), manual flows per docs/E2E_TESTING.md sections 3-6.
Setup deviations (recorded for the Tech Lead):

- Web runs on port 5174 (Vite --strictPort). Port 5173 was already held by an unrelated bun process (not touched).
- Seeded users were created by db:seed in the E2E DB. Their plaintext passwords are not in the repo, so the run used a shell-level override of AUTH_LOCAL_IDENTITY_DIRECTORY with generated test passwords. .env and the repo were not modified.
- The E2E DB category download flag was changed for the denial and enable steps (see BE-S3-02 and FE-S3-02).
- Playwright could only read/write files under its allowed root, so fixtures were copied there for the run and removed afterwards.

```text
AC:          AC-01.02
Card:        FE-S1-02
Environment: local E2E stack: Web http://localhost:5174, API http://localhost:3001, worker queue axentra-jobs, DB axentra_e2e_test (127.0.0.1:15432), Redis 127.0.0.1:16379, MinIO 127.0.0.1:19000
Role:        member_team (member@axentra.internal)
Input:       report-api.pdf uploaded in the same session, then full page reload
Expected:    report-api.pdf still in the document list after refresh
Observed:    After a full navigation reload the dashboard restored without a login prompt and report-api.pdf is listed as Selesai Diproses
Result:      Pass
Screenshot:  docs/screenshots/FE-S1-02/after-refresh.png
```

## Re-run 2026-10-27: paginated document list

Run: Playwright MCP (Chromium) after the pagination change (page size 5). Fresh DB `axentra_e2e_test`, six PDF fixtures uploaded one per upload, test users created by db:seed with generated passwords held outside the repo.

```text
AC:          AC-01.02 (list shows documents; page navigation for more than 5)
Card:        FE-S1-02
Environment: local E2E stack: Web http://localhost:5174, API http://localhost:3001, worker queue axentra-jobs, DB axentra_e2e_test (127.0.0.1:15432), Redis 127.0.0.1:16379, MinIO 127.0.0.1:19000
Role:        member_team (member.e2e@axentra.test)
Input:       Six PDFs uploaded (alpha, beta, gamma, delta, epsilon, zeta), each processed to Selesai Diproses
Expected:    Page 1 shows five rows, label "Halaman 1 dari 2", Previous disabled, Next enabled; Next shows the sixth document, label "Halaman 2 dari 2", Next disabled
Observed:    Page 1: five rows, "Halaman 1 dari 2", Previous disabled, Next enabled. Next: one row (e2e-alpha-contract.pdf), "Halaman 2 dari 2", Previous enabled, Next disabled. No console errors on the dashboard.
Result:      Pass
Screenshot:  docs/screenshots/FE-S1-02/pagination-page1-rerun-2026-10-27.png
```
