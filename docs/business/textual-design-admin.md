# Textual Design - Admin

Source: [proposals/admin-role-proposal.md](../proposals/admin-role-proposal.md) (PROP-ADM-01, 02, 03, and 05). The Admin role is not in the BA workbook. Figma is the visual reference: "Axentra – Admin (Sprint 4)", <https://www.figma.com/design/ex7fHDD12UjBHNkI2u10U0>. Any copy not listed here must be taken from Figma and confirmed before FE-S4-04 to FE-S4-07 start.

## Menu

Decided on 2026-10-30 by the Tech Lead (proposal question 8). Shown only to role `admin`:

- `Dashboard`
- `Manajemen Akun`
- `Manajemen Dokumen`
- `Audit Trail`

Current state on `dev`: the menu lives in `apps/web/src/app/app-shell.menu.ts` (`ROLE_MENU`). It has entries for `member_team` and `head_of_team` only. `resolveShellRole` sends `admin` to the Member Team menu, and login sends every role to `/dashboard`. Under Option A, verbally approved by Tech Lead Arya as reported on 2026-11-06 (see [09-admin.md](../api-specs/09-admin.md), O12), FE-S4-06 provides the `/admin/documents` route and document management menu entry, while FE-S4-05 provides the `/admin/users` entry. FE-S4-07 adds the Dashboard and Audit Trail entries, along with the Admin login redirect. Merge order for FE-S4-05 and FE-S4-06 remains pending; once both branches land on `dev`, verify that both entries appear in the Admin menu.

## Routes (usulan)

Proposed paths for the Admin pages. Confirm before FE-S4-04 starts:

| Page              | Path                    | Card     |
| ----------------- | ----------------------- | -------- |
| Dashboard         | `/admin/dashboard`      | FE-S4-04 |
| Manajemen Akun    | `/admin/users`          | FE-S4-05 |
| Manajemen Dokumen | `/admin/documents`      | FE-S4-06 |
| Detail dokumen    | `/admin/documents/:id`  | FE-S4-06 |
| Audit Trail       | `/audit-trail` (shared) | FE-S4-07 |

After login, `admin` goes to `/admin/dashboard`. Every Admin route uses `ProtectedRoute` with `allowedRoles={["admin"]}`, and `/audit-trail` adds `admin` to its allowed roles.

## Dashboard (PROP-ADM-AC-01)

- Data cards: number of users per role (Member Team, Head of Team, Admin).
- Data cards: total documents, and documents uploaded in the last 7 days.
- Download activity summary: total downloads and the latest download time.

## Manajemen Akun (PROP-ADM-AC-02)

- Account list for Member Team and Head of Team: name, role, and status (aktif or nonaktif).
- Buttons: `Nonaktifkan` on an active account and `Aktifkan` on an inactive one. Both need a confirmation step, a loading state, and an error state (see FE-S4-05 in [TASK_BREAKDOWN.md](../TASK_BREAKDOWN.md)).
- No role change control.

## Manajemen Dokumen (PROP-ADM-AC-03)

- Document list: title, owner, upload date, and archive status.
- Detail: metadata, owner, and category. No preview and no document content (decided 2026-11-04).
- Buttons:
  - `Arsipkan` on an active document.
  - `Batalkan arsip` on an archived document (PROP-ADM-AC-03.05, usulan).
  - `Hapus` as a soft delete, with a required confirmation step.
- Owner is empty for legacy documents. Show "Tidak diketahui" (usulan, see O8 in [09-admin.md](../api-specs/09-admin.md)).

## Audit Trail (PROP-ADM-AC-05)

- Same fields as Head of Team: Siapa (User), Apa (Nama Dokumen), and Kapan (Waktu), for downloads by all users.
- Same page as FE-S4-02. The Admin role is added to that page.

## Not Yet Defined

- Confirmation text, error messages, and empty-state copy: pending Figma.
- Colors and layout: pending Figma. The shell tokens are defined in [13-app-shell.md](../technical-specs/13-app-shell.md).
