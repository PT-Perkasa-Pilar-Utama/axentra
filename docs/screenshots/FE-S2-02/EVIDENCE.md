# Evidence: FE-S2-02 - Top Tags filtering (single and multi tag)

Run: 2026-10-27, branch FND-10-Resolve-sprint-1-3-partials-and-blockers, Playwright MCP (Chromium), manual flows per docs/E2E_TESTING.md sections 3-6.
Diverifikasi pada SHA: 2b5152cdcff4b971e032db648cce3a264780e74d (re-run 2026-10-29, bagian di bawah; record 2026-10-27 tidak mencatat SHA)

Catatan SHA: run ini tidak mencatat SHA commit. Ulangi alur pada SHA final sebelum rilis, lalu catat SHA di sini.

Setup deviations (recorded for the Tech Lead):

- Web runs on port 5174 (Vite --strictPort). Port 5173 was already held by an unrelated bun process (not touched).
- Seeded users were created by db:seed in the E2E DB. Their plaintext passwords are not in the repo, so the run used a shell-level override of AUTH_LOCAL_IDENTITY_DIRECTORY with generated test passwords. .env and the repo were not modified.
- The E2E DB category download flag was changed for the denial and enable steps (see BE-S3-02 and FE-S3-02).
- Playwright could only read/write files under its allowed root, so fixtures were copied there for the run and removed afterwards.

```text
AC:          AC-04.03
Card:        FE-S2-02
Environment: local E2E stack: Web http://localhost:5174, API http://localhost:3001, worker queue axentra-jobs, DB axentra_e2e_test (127.0.0.1:15432), Redis 127.0.0.1:16379, MinIO 127.0.0.1:19000
Role:        member_team (member@axentra.internal)
Input:       Click Top Tags chip strategy on the dashboard (no search text)
Expected:    List filtered to documents with tag strategy; active chip highlighted
Observed:    List shows only report-api.pdf; the strategy chip is pressed/active
Result:      Pass
Screenshot:  docs/screenshots/FE-S2-02/single-tag-highlight-dashboard.png
```

```text
AC:          AC-04.03
Card:        FE-S2-02
Environment: local E2E stack: Web http://localhost:5174, API http://localhost:3001, worker queue axentra-jobs, DB axentra_e2e_test (127.0.0.1:15432), Redis 127.0.0.1:16379, MinIO 127.0.0.1:19000
Role:        member_team (member@axentra.internal)
Input:       Search "API", then click chip strategy on the search results
Expected:    Search results filtered to strategy; chip highlighted
Observed:    Results remain report-api.pdf; the strategy chip is pressed/active
Result:      Pass
Screenshot:  docs/screenshots/FE-S2-02/single-tag-highlight-dashboard.png
Note:        Screenshot is the dashboard state; the search-results state is recorded in the observation only.
```

```text
AC:          AC-04.04
Card:        FE-S2-02
Environment: local E2E stack: Web http://localhost:5174, API http://localhost:3001, worker queue axentra-jobs, DB axentra_e2e_test (127.0.0.1:15432), Redis 127.0.0.1:16379, MinIO 127.0.0.1:19000
Role:        member_team (member@axentra.internal)
Input:       Top Tags chips strategy and legal (literal AC tags), using strategy-legal.pdf uploaded for this check (tags legal, strategy)
Expected:    Documents that have both tags
Observed:    Only strategy-legal.pdf is listed; both chips are pressed
Result:      Pass
Screenshot:  docs/screenshots/FE-S2-02/literal-legal-strategy.png
```

```text
AC:          AC-04.04
Card:        FE-S2-02
Environment: local E2E stack: Web http://localhost:5174, API http://localhost:3001, worker queue axentra-jobs, DB axentra_e2e_test (127.0.0.1:15432), Redis 127.0.0.1:16379, MinIO 127.0.0.1:19000
Role:        member_team (member@axentra.internal)
Input:       Chip reporting alone, then reporting plus strategy (AND check)
Expected:    Reporting alone shows all Reporting-tagged documents; reporting plus strategy shows only documents with both
Observed:    reporting alone: report-api.pdf, sample-a.docx, sample-b.docx, sample-c.docx. reporting plus strategy: only report-api.pdf
Result:      Pass
Screenshot:  docs/screenshots/FE-S2-02/multi-tag-and-filter.png
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
AC:          AC-04.03
Card:        FE-S2-02
Commit:      2b5152cdcff4b971e032db648cce3a264780e74d
Environment: local E2E stack: Web http://localhost:5174, API http://localhost:3001, DB axentra_test (127.0.0.1:15432), Redis 127.0.0.1:16379, MinIO 127.0.0.1:19000
Role:        member_team (member.r2@local.test)
Input:       Click Top Tags chip strategy on the dashboard (from page 2)
Expected:    List filtered to documents with tag strategy; active chip highlighted
Observed:    Chip strategy highlighted; list shows strategy-legal.pdf and report-api.pdf; pagination returned to "Halaman 1 dari 1"
Result:      Pass
Screenshot:  docs/screenshots/FE-S2-02/filter-strategy-rerun-2026-10-29.jpg
```

```text
AC:          AC-04.04
Card:        FE-S2-02
Commit:      2b5152cdcff4b971e032db648cce3a264780e74d
Environment: local E2E stack: Web http://localhost:5174, API http://localhost:3001, DB axentra_test (127.0.0.1:15432), Redis 127.0.0.1:16379, MinIO 127.0.0.1:19000
Role:        member_team (member.r2@local.test)
Input:       Chips strategy and legal together
Expected:    Documents that have both tags
Observed:    Both chips highlighted; list shows only strategy-legal.pdf
Result:      Pass
Screenshot:  docs/screenshots/FE-S2-02/filter-strategy-legal-rerun-2026-10-29.jpg
```
