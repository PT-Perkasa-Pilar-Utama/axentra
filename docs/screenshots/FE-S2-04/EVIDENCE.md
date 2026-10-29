# Evidence: FE-S2-04 - Search results and empty state

Run: 2026-10-27, branch FND-10-Resolve-sprint-1-3-partials-and-blockers, Playwright MCP (Chromium), manual flows per docs/E2E_TESTING.md sections 3-6.
Diverifikasi pada SHA: a02dd05

Catatan SHA: Alur walkthrough diverifikasi pada commit a02dd05 (Bun 1.4.3).

Copy difference: the AC-06.04 record observes `Tidak ada hasil yang ditemukan untuk "xyzabc"`, which appends the searched keyword. The BA copy is `Tidak ada hasil yang ditemukan`. The Pass on that record does not settle the difference. Repeat the run on the committed SHA once the copy is settled.

Setup deviations (recorded for the Tech Lead):

- Web runs on port 5174 (Vite --strictPort). Port 5173 was already held by an unrelated bun process (not touched).
- Seeded users were created by db:seed in the E2E DB. Their plaintext passwords are not in the repo, so the run used a shell-level override of AUTH_LOCAL_IDENTITY_DIRECTORY with generated test passwords. .env and the repo were not modified.
- The E2E DB category download flag was changed for the denial and enable steps (see BE-S3-02 and FE-S3-02).
- Playwright could only read/write files under its allowed root, so fixtures were copied there for the run and removed afterwards.

```text
AC:          AC-06.01
Card:        FE-S2-04
Environment: local E2E stack: Web http://localhost:5174, API http://localhost:3001, worker queue axentra-jobs, DB axentra_e2e_test (127.0.0.1:15432), Redis 127.0.0.1:16379, MinIO 127.0.0.1:19000
Role:        member_team (member@axentra.internal)
Input:       Type "API" and press Enter
Expected:    At least one relevant document
Observed:    report-api.pdf returned
Result:      Pass
Screenshot:  docs/screenshots/FE-S2-04/search-api-results.png
```

```text
AC:          AC-06.02
Card:        FE-S2-04
Environment: local E2E stack: Web http://localhost:5174, API http://localhost:3001, worker queue axentra-jobs, DB axentra_e2e_test (127.0.0.1:15432), Redis 127.0.0.1:16379, MinIO 127.0.0.1:19000
Role:        member_team (member@axentra.internal)
Input:       Type "API" and press Enter
Expected:    Each result shows file name and matching snippet
Observed:    report-api.pdf with snippet "API reporting strategy overview"
Result:      Pass
Screenshot:  docs/screenshots/FE-S2-04/search-api-results.png
```

```text
AC:          AC-06.03
Card:        FE-S2-04
Environment: local E2E stack: Web http://localhost:5174, API http://localhost:3001, worker queue axentra-jobs, DB axentra_e2e_test (127.0.0.1:15432), Redis 127.0.0.1:16379, MinIO 127.0.0.1:19000
Role:        member_team (member@axentra.internal)
Input:       Measured in the browser from Enter to result visible: "API" and "xyzabc"
Expected:    Result shown in under 3 seconds
Observed:    about 59 ms (API) and 65 ms (xyzabc empty state) on a 7-document dataset
Result:      Pass
Screenshot:  No screenshot (timing only)
Note:        Small local dataset only. Not a 10,000-record load test.
```

```text
AC:          AC-06.04
Card:        FE-S2-04
Environment: local E2E stack: Web http://localhost:5174, API http://localhost:3001, worker queue axentra-jobs, DB axentra_e2e_test (127.0.0.1:15432), Redis 127.0.0.1:16379, MinIO 127.0.0.1:19000
Role:        member_team (member@axentra.internal)
Input:       Type "xyzabc" and press Enter
Expected:    "Tidak ada hasil yang ditemukan"
Observed:    Message shows "Tidak ada hasil yang ditemukan untuk "xyzabc""
Result:      Pass
Screenshot:  docs/screenshots/FE-S2-04/no-results.png
```
