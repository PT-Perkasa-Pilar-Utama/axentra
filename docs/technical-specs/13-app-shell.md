# 13. App Shell

**Status:** Decided by the Tech Lead on 2026-10-30. Applies from Sprint 4.

Every authenticated page uses **one** shared `AppShell` component. The shell looks the same for
every role. Only the menu entries and the page content change per role. Do not build a second
sidebar, a role-specific layout, or a copy of the existing sidebar markup.

## Source of truth

| What               | Where                                                                                                                                                                                                    |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Current shell code | `apps/web/src/app/member-team-dashboard.page.tsx` (`<aside className="dashboard-sidebar">`) and `apps/web/src/features/categories/categories.css`                                                        |
| Visual design      | Figma "Axentra – Admin (Sprint 4)": <https://www.figma.com/design/ex7fHDD12UjBHNkI2u10U0>                                                                                                                |
| Shell tokens       | `--sidebar-surface: #25282e`, `--sidebar-text: #f7f8fa`, `--sidebar-muted: #b8bfc8`, `--sidebar-divider: #454a52`, `--sidebar-accent: #65a448`; page background `#f0f2f4`; font Exo 2 (`typography.css`) |
| Role names         | [09-authentication.md](09-authentication.md): `member_team`, `head_of_team`, `admin`                                                                                                                     |

If the Figma file and the running Member Team dashboard disagree on the shell, the running
dashboard wins. The Figma file wins only for the Admin page content.

## Structure

```text
AppShell
|-- Sidebar
|   |-- Brand        PERKASA logo (existing asset perkasa-logo-sidebar.png)
|   |-- Menu         entries from the role menu config, one marked active by the current route
|   |-- Role extras  optional slot (Member Team and Head of Team: CategoryNavigationView)
|   `-- User block   name, role label, logout
`-- Main
    |-- Page header  title (h1) on the left, optional actions or search on the right
    `-- Content      the feature view (<feature>.view.tsx)
```

## Menu per role

Keep the menu in one typed config, keyed by role. Menu labels are Bahasa Indonesia.

| Role           | Menu entries                                                                                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `member_team`  | Dashboard, plus the existing category navigation                                                                                                             |
| `head_of_team` | Dashboard, the existing category navigation, plus the Head of Team pages from FE-S4-01 to FE-S4-03, labelled as in `business/textual-design-head-of-team.md` |
| `admin`        | Dashboard, Manajemen Akun, Manajemen Dokumen, Audit Trail                                                                                                    |

The Admin home label is **Dashboard**, not "Dasbor Admin".

## Rules for developers and agents

1. Reuse `AppShell`. A new page passes its title, header actions, and content to the shell. It does
   not render its own `<aside>`, logo, or user block.
2. Add or change a menu entry only in the role menu config. Do not branch on role inside the shell
   markup.
3. Hiding a menu entry is presentation only. Each route still uses `ProtectedRoute` with
   `allowedRoles`, and the API still enforces the role. Admin must not reach preview or download
   routes even by typing the URL (BE-S4-08).
4. Use the shell tokens above. Do not introduce new sidebar colors, widths, or fonts.
5. Keep the responsive behavior of the current sidebar (one column below `md`, 18.75rem sidebar
   from `md`).
6. Page content keeps the API -> Presenter -> View pattern and its loading, empty, error, and
   success states. The shell does not fetch feature data.

## Ownership

FE-S4-07 (Azis) extracts `AppShell` from the Member Team dashboard and adds the role menu config.
The other Sprint 4 FE cards (FE-S4-01 to FE-S4-06) render inside it. Until FE-S4-07 is merged, those
cards build their page content as a view component, so it can drop into the shell without rework.
