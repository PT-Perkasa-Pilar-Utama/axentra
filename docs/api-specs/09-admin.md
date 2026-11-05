# Admin API

Source: PROP-ADM-01, PROP-ADM-02, PROP-ADM-03, and PROP-ADM-05 in [proposals/admin-role-proposal.md](../proposals/admin-role-proposal.md). BA (Azizah) approved these scopes on 2026-10-29. The `PROP-ADM-*` identifiers are temporary and are not BA IDs; BA may renumber them.

Status: **In Progress** (Sprint 4: Admin). `GET /admin/summary` is implemented (BE-S4-05). Account management (BE-S4-06), document management (BE-S4-07), and audit trail access (BE-S4-08) remain planned. Cards: DB-S4-01, BE-S4-05, BE-S4-06, BE-S4-07, and BE-S4-08 in [TASK_BREAKDOWN.md](../TASK_BREAKDOWN.md).

Items marked **(usulan)** are proposed defaults that the Tech Lead has not yet recorded. Items listed under [Open Decisions](#open-decisions) must be answered before the cards that depend on them start.

## Shared Rules

- Every endpoint requires a `Bearer` access token. A missing, invalid, or expired token returns `401 UNAUTHORIZED`.
- Every endpoint requires role `admin`. Any other authenticated role returns `403 FORBIDDEN`.
- Responses use the envelopes in [01-conventions.md](01-conventions.md).
- List endpoints use `page` and `limit` with the same defaults and limits as `GET /audit/downloads`: `page` defaults to `1` (`1 <= page <= 1000`), and `limit` defaults to `20` (`1 <= limit <= 100`). Lists are ordered deterministically (usulan: by `email ASC, id ASC` for users, and by `created_at DESC, id DESC` for documents).
- Admin cannot upload documents (usulan, proposal question 2).
- Admin cannot change an account's role (usulan, proposal question 3). The proposal marks this out of scope.
- Admin sees document metadata only. Admin cannot preview or download document content from any category. Decided for proposal questions 7 and 9: question 7 by the Tech Lead on 2026-10-29 and approved by BA on 2026-11-04; question 9 on 2026-11-04. Target behavior: until `BE-S4-08` ships, `dev` still allows `admin` on these routes. `BE-S4-08` implements it (see [Admin Document Access](#admin-document-access)).
- Category download permission management by Admin (PROP-ADM-04) is out of scope and is not defined here.

## Dashboard Summary

### `GET /api/v1/admin/summary`

Covers `BE-S4-05` and `PROP-ADM-AC-01.01` to `01.03`.

Success (`200 OK`):

```json
{
  "success": true,
  "data": {
    "usersByRole": {
      "member_team": 10,
      "head_of_team": 2,
      "admin": 1
    },
    "totalDocuments": 42,
    "uploadedLast7Days": 8,
    "downloadCount": 120,
    "latestDownloadAt": "2026-11-03T07:46:00.000Z"
  }
}
```

- `usersByRole` counts every account for each role, including inactive accounts (decided, see O10).
- `totalDocuments` counts documents with `deleted_at IS NULL` that have a stored file, the same rule as `GET /analytics/summary`. Includes archived documents (decided, see O7).
- `uploadedLast7Days` counts documents by `created_at >= now - 7 days`, with the same filters as `totalDocuments`.
- `downloadCount` counts every row in `download_audit_events`, across all users.
- `latestDownloadAt` is the latest `downloaded_at`, or `null` when no download has been recorded.

Errors: `401 UNAUTHORIZED`, `403 FORBIDDEN`.

## Account Management

### `GET /api/v1/admin/users`

Covers `BE-S4-06` and `PROP-ADM-AC-02.01`.

Query parameters: `page` and `limit`, as described in Shared Rules.

Behavior:

- Returns accounts with role `member_team` or `head_of_team` only. Accounts with role `admin` are excluded (usulan).
- `status` comes from `users.status` (see DB-S4-01 in [06-data-model.md](../technical-specs/06-data-model.md)).

Success (`200 OK`):

```json
{
  "success": true,
  "data": [
    {
      "id": "22222222-2222-4222-8222-222222222222",
      "name": "Rina Pratama",
      "email": "member@axentra.test",
      "role": "member_team",
      "status": "active"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 1
  }
}
```

| Field    | Type                              | Description                                 |
| -------- | --------------------------------- | ------------------------------------------- |
| `id`     | `string` (UUID)                   | User identifier                             |
| `name`   | `string \| null`                  | Display name; `null` when none was provided |
| `email`  | `string`                          | User email                                  |
| `role`   | `"member_team" \| "head_of_team"` | Account role                                |
| `status` | `"active" \| "inactive"`          | Account status                              |

Errors: `400 VALIDATION_ERROR` for invalid `page` or `limit`, `401 UNAUTHORIZED`, `403 FORBIDDEN`.

### `PATCH /api/v1/admin/users/:id/status`

Covers `BE-S4-06`, `PROP-ADM-AC-02.02`, and `PROP-ADM-AC-02.03`.

Request body:

```json
{
  "status": "inactive"
}
```

`status` must be `"active"` or `"inactive"`.

Behavior:

- Target role must be `member_team` or `head_of_team`. Any other target is rejected with `422 INVALID_TARGET_ROLE` (usulan). Because admin accounts cannot be targets, an Admin cannot deactivate its own account through this endpoint.
- Deactivating the last active `head_of_team` is rejected with `422 LAST_HEAD_OF_TEAM` (usulan, see O4).
- Setting the status it already has returns `200 OK` with no change (idempotent, per [01-conventions.md](01-conventions.md)).
- Setting `inactive` revokes every active session of the target account (`auth_sessions.revoked_at`). Access and refresh tokens for those sessions return `401 UNAUTHORIZED` afterwards, as in [09-authentication.md](../technical-specs/09-authentication.md).
- A deactivated account cannot log in. See [Authentication Effects](#authentication-effects).

Success (`200 OK`):

```json
{
  "success": true,
  "data": {
    "id": "22222222-2222-4222-8222-222222222222",
    "role": "member_team",
    "status": "inactive"
  }
}
```

Errors:

- `400 VALIDATION_ERROR`: body is malformed or `status` is not `active` or `inactive`.
- `401 UNAUTHORIZED`, `403 FORBIDDEN`.
- `404 NOT_FOUND`: no user with that `id`. Message: `Pengguna tidak ditemukan`.
- `422 INVALID_TARGET_ROLE`: target role is `admin` (usulan).
- `422 LAST_HEAD_OF_TEAM`: the target is the last active `head_of_team` (usulan, O4).

## Document Management

Shared rules for this section:

- Admin lists include active documents and archived documents.
- Documents with `deleted_at` set are excluded from every Admin list and every Admin detail route. Such a request returns `404 NOT_FOUND`.
- Admin responses contain metadata only. They never include document content, storage keys, or signed URLs.

### `GET /api/v1/admin/documents`

Covers `BE-S4-07` and `PROP-ADM-AC-03.01`.

Query parameters: `page` and `limit`, as described in Shared Rules.

Success (`200 OK`):

```json
{
  "success": true,
  "data": [
    {
      "id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
      "title": "Laporan-Q1-2026.pdf",
      "ownerId": "22222222-2222-4222-8222-222222222222",
      "ownerName": "Rina Pratama",
      "uploadedAt": "2026-04-17T08:00:00.000Z",
      "archivedAt": null
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 1
  }
}
```

| Field        | Type                | Description                                                           |
| ------------ | ------------------- | --------------------------------------------------------------------- |
| `id`         | `string` (UUID)     | Document identifier                                                   |
| `title`      | `string`            | Document title                                                        |
| `ownerId`    | `string \| null`    | Uploader; `null` for legacy rows without a recorded uploader (see O8) |
| `ownerName`  | `string \| null`    | Uploader name; `null` when `ownerId` is `null`                        |
| `uploadedAt` | `string` (ISO 8601) | Upload time, from `documents.created_at`                              |
| `archivedAt` | `string \| null`    | Archive time; `null` when the document is active                      |

Errors: `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`.

### `GET /api/v1/admin/documents/:id`

Covers `BE-S4-07` and `PROP-ADM-AC-03.02`.

Success (`200 OK`) returns the fields of the list item above, plus:

- `categoryId` and `categoryName`, both `null` when the document is uncategorized.
- `metadata`: `author` and `extractedAt` from the extracted metadata in [04-processing.md](04-processing.md), or `null` when metadata has not been extracted yet. `rawMetadata` is not returned, because Admin sees descriptive metadata only (proposal question 7).

Errors: `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 NOT_FOUND` (document does not exist or is soft-deleted).

### `POST /api/v1/admin/documents/:id/archive`

Covers `BE-S4-07` and `PROP-ADM-AC-03.03`.

Sets `archivedAt` to the current time. Archiving a document that is already archived returns `200 OK` with the current state (usulan, idempotent).

Success (`200 OK`):

```json
{
  "success": true,
  "data": {
    "id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
    "archivedAt": "2026-11-04T03:00:00.000Z"
  }
}
```

Effect: the document no longer appears in Member Team or Head of Team lists, search, tags, or related documents. Direct access by those roles returns `404 NOT_FOUND` (usulan, see O6).

Errors: `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 NOT_FOUND`.

### `POST /api/v1/admin/documents/:id/unarchive`

Covers `BE-S4-07`. The proposal allows this in question 5, which the Tech Lead recorded on 2026-10-29. The matching AC is `PROP-ADM-AC-03.05` (usulan, see [admin-role-proposal.md](../proposals/admin-role-proposal.md)).

Clears `archivedAt`. Unarchiving a document that is not archived returns `200 OK` with the current state (usulan, idempotent).

Success (`200 OK`):

```json
{
  "success": true,
  "data": {
    "id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
    "archivedAt": null
  }
}
```

Errors: `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 NOT_FOUND`.

### `DELETE /api/v1/admin/documents/:id`

Covers `BE-S4-07` and `PROP-ADM-AC-03.04`.

Soft delete only. Sets `deleted_at` to the current time and keeps the row, its file record, and its metadata. Hard delete is not part of this API.

Success (`200 OK`):

```json
{
  "success": true,
  "data": {
    "id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
    "deletedAt": "2026-11-04T03:05:00.000Z"
  }
}
```

Effect: the document is removed from every list and from every detail route for every role, including Admin.

Errors: `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 NOT_FOUND` (already soft-deleted or never existed).

## Audit Trail for All Users

### `GET /api/v1/audit/downloads` for role `admin`

Covers `BE-S4-08` and `PROP-ADM-AC-05.01`.

Role `admin` is added to the allowed roles of [07-audit-permissions.md](07-audit-permissions.md). Admin receives events from all users. The response shape is the same as for Head of Team.

## Admin Document Access

Covers `BE-S4-08` and `PROP-ADM-AC-05.02`. Question 7 was decided by the Tech Lead (Arya Isnaidi) on 2026-10-29 and approved by BA (Azizah) on 2026-11-04. Question 9 was decided on 2026-11-04. Result: Admin sees document metadata only and cannot preview or download document content from any category (proposal questions 7 and 9, option c).

Required behavior:

- `GET /documents/:id/preview`, `GET /documents/:id/preview/content`, `GET /documents/:id/download`, and `POST /documents/bulk-download` reject role `admin` with `403 FORBIDDEN`. The role check runs before any document lookup, so the response does not reveal whether the document exists.
- `admin` is removed from the allowed roles of those routes in [03-documents.md](03-documents.md). `member_team` and `head_of_team` keep their current behavior.
- `resolveCanDownload` returns `false` for `admin`. It returns `true` today (see `documents.detail.operations.ts`). `GET /documents/:id` already returns `403` for `admin`, so this change only closes a path that could grant download rights later.
- A rejected Admin request writes no download audit event, so Admin attempts do not appear in the audit trail or in Head of Team analytics.
- Admin pages never show a preview or download button, and Admin responses never contain storage keys or signed URLs.

## Authentication Effects

Covers `BE-S4-06`.

- A deactivated account cannot log in. Login returns `401 UNAUTHORIZED` with the generic message `Email atau kata sandi salah` (usulan, see O2).
- The rule applies to both login paths in [02-authentication.md](02-authentication.md): the development and test identity directory (`AUTH_LOCAL_IDENTITY_DIRECTORY`), and the production `users` table. Today only the production path reads a table, so the development path needs a status check as well (see O3).
- Revoking sessions on deactivation follows the revocation rules in [09-authentication.md](../technical-specs/09-authentication.md).

## Traceability

| Card     | Endpoints or behavior                                               | Proposal AC                                   |
| -------- | ------------------------------------------------------------------- | --------------------------------------------- |
| DB-S4-01 | `users.status`, `documents.uploaded_by`, `documents.archived_at`    | PROP-ADM-AC-02.02, 02.03, 03.01, 03.02, 03.03 |
| BE-S4-05 | `GET /admin/summary`                                                | PROP-ADM-AC-01.01 to 01.03                    |
| BE-S4-06 | `GET /admin/users`, `PATCH /admin/users/:id/status`, login effects  | PROP-ADM-AC-02.01 to 02.03                    |
| BE-S4-07 | `GET /admin/documents`, detail, archive, unarchive, delete          | PROP-ADM-AC-03.01 to 03.05 (03.05 usulan)     |
| BE-S4-08 | Admin on `GET /audit/downloads`; admin removed from document routes | PROP-ADM-AC-05.01; PROP-ADM-AC-05.02          |

## Open Decisions

| ID  | Question                                                                                | Affects                                                                                                                                | Proposed default                                                                                                                      |
| --- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| O1  | Admin access to document content (proposal questions 7 and 9)                           | BE-S4-08                                                                                                                               | **Decided**: metadata only, no preview or download (Q7 by Tech Lead 2026-10-29, BA approved 2026-11-04; Q9 on 2026-11-04)             |
| O2  | Message and status for login by a deactivated account                                   | BE-S4-06, FE-S4-05                                                                                                                     | `401` with the generic message, to avoid revealing account status                                                                     |
| O3  | The development and test identity directory has no status field                         | BE-S4-06, QA                                                                                                                           | Check `users.status` by `id` after the directory verifies the password                                                                |
| O4  | Can the last active Head of Team be deactivated?                                        | BE-S4-06                                                                                                                               | Not allowed, `422 LAST_HEAD_OF_TEAM` (usulan)                                                                                         |
| O5  | Are Admin mutations written to an audit trail (deactivate, archive, unarchive, delete)? | BE-S4-06, BE-S4-07                                                                                                                     | Yes (usulan). The audit record format for these actions is not defined in the docs yet; confirm before BE-S4-06 starts                |
| O6  | Can Member Team or Head of Team open an archived document by direct URL?                | 03, 04, 05 specs                                                                                                                       | `404 NOT_FOUND`, same as soft-deleted                                                                                                 |
| O7  | Do `totalDocuments` and `uploadedLast7Days` include archived documents?                 | BE-S4-05                                                                                                                               | **Decided** (Tech Lead, 2026-11-05): Yes, archived documents are stored in the system and included in totals and 7-day upload counts. |
| O8  | Legacy documents have no uploader. How does the UI show them?                           | DB-S4-01, FE-S4-06 **Decided** (Tech Lead, 2026-11-05): `ownerId` and `ownerName` are `null`, shown as "Tidak diketahui". No backfill. |
| O9  | Does the Admin document list include documents without a stored file?                   | BE-S4-07                                                                                                                               | No, same rule as `totalDocuments`                                                                                                     |
| O10 | Does `usersByRole` include inactive accounts?                                           | BE-S4-05                                                                                                                               | **Decided** (Tech Lead, 2026-11-05): Yes, `usersByRole` counts all registered accounts per role, including inactive accounts.         |
| O11 | Where does the Admin test account come from (seed, script, or manual input)?            | QA, BE-S4-06                                                                                                                           | Add an Admin account to the local seed and run `bun run db:seed` (usulan)                                                             |
