# Acceptance Evidence: FE-S4-02 (Build download audit trail page)

## Status: Blocked

- **Card ID**: `FE-S4-02`
- **Acceptance Criteria**: `AC-12.01` (Tracking Log Unduhan)
- **PIC**: Aiman
- **Tech Lead / Approver**: Arya Isnaidi
- **Date**: 2026-10-30

### Verification Evidence State

Per `CLAUDE.md`: _"If a dependency is not implemented or available, mark the check Blocked, not Pass."_

1. **Backend Dependency Status**:
   - `BE-S4-02` (`GET /api/v1/audit/downloads`) is planned and not yet merged into `dev`.
   - The API process does not yet expose the download audit trail endpoint in the shared integration branch.

2. **Frontend Implementation Status**:
   - Route `/audit-trail` is registered and guarded by `ProtectedRoute allowedRoles={["head_of_team"]}`.
   - The view renders as a pure page content component that drops into the upcoming `AppShell` (FE-S4-07) without a duplicated `<aside>` or custom sidebar, complying with `docs/technical-specs/13-app-shell.md`.
   - The page displays an accessible table satisfying AC-12.01 directly upon opening:
     - **Siapa (User)**: `displayUser` / `userName` / `userEmail`
     - **Apa (Nama Dokumen)**: `documentName`
     - **Kapan (Waktu Unduh)**: `downloadedAtFormatted` (formatted in `Asia/Jakarta` WIB)
   - Client search filters across document name, user name, and user email.
   - Tests in `apps/web/test/audit-trail.integration.test.tsx` verify the documented API response contract and table behavior with in-memory fixtures.

3. **Next Steps for Acceptance Pass**:
   - Once `BE-S4-02` merges into `dev`, rebase `FE-S4-02` and execute a live end-to-end walkthrough on the running stack (`bun run infra:up`, `dev:api`, `dev:web`) with a seeded `head_of_team` session.
   - Capture and commit live runtime screenshots here to update this record from **Blocked** to **Passed**.
