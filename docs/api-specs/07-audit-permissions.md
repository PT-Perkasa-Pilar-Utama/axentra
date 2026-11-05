# Audit and Permission Category API

Source: BA user stories US-12 and US-13.

`GET /api/v1/audit/downloads` (`BE-S4-02`, `AC-12.01`), `GET /api/v1/permission-categories` (`BE-S4-03`, partial `AC-13.01`), and `PATCH /api/v1/permission-categories/:categoryId` (`BE-S4-04`, partial `AC-13.01`) are implemented at the API level; the permission category UI toggle (`FE-S4-03`) and end-to-end acceptance verification (`QA-S4-01`) remain planned.

## Download Audit Trail

### `GET /api/v1/audit/downloads`

Status: **Implemented** (`BE-S4-02`, `AC-12.01`).

Authorization:

- Requires authentication (`Bearer` access token).
- Allowed roles: `head_of_team`, and `admin` once `BE-S4-08` ships (Planned; see [09-admin.md](09-admin.md)). `member_team` receives `403 FORBIDDEN`. Until `BE-S4-08` ships, `admin` also receives `403 FORBIDDEN`.

Query parameters:

| Parameter | Type    | Default | Constraints         | Description           |
| --------- | ------- | ------- | ------------------- | --------------------- |
| `page`    | integer | `1`     | `1 <= page <= 1000` | 1-based page number   |
| `limit`   | integer | `20`    | `1 <= limit <= 100` | Maximum rows per page |

Behavior:

- Returns download audit events ordered newest first (`downloaded_at DESC, id DESC`).
- Each item includes point-in-time snapshot values (`userName`, `userEmail`, `documentName`) recorded when the download occurred, falling back to `users` via `LEFT JOIN` if `userName` or `userEmail` was omitted at insert time.
- Historical rows remain visible even if the referenced user or document is later deleted (`ON DELETE SET NULL`).

Response (`200 OK`):

```json
{
  "success": true,
  "data": [
    {
      "id": "00000000-0000-4000-8000-000000000001",
      "userId": "22222222-2222-4222-8222-222222222222",
      "userName": "Rina Pratama",
      "userEmail": "member@axentra.test",
      "documentId": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
      "documentName": "Laporan-Q1-2026.pdf",
      "downloadedAt": "2026-04-17T08:00:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 1
  }
}
```

Item fields (`DownloadAuditEvent` in `@axentra/shared`):

| Field          | Type             | Purpose                           |
| -------------- | ---------------- | --------------------------------- |
| `id`           | `string` (UUID)  | Audit event identifier            |
| `userId`       | `string \| null` | Downloading user identifier       |
| `userName`     | `string \| null` | Downloading user display name     |
| `userEmail`    | `string \| null` | Downloading user email snapshot   |
| `documentId`   | `string \| null` | Downloaded document identifier    |
| `documentName` | `string`         | Downloaded document name snapshot |
| `downloadedAt` | `string` (ISO)   | Download timestamp                |

Error responses:

| Status | Code               | When                                              |
| ------ | ------------------ | ------------------------------------------------- |
| `400`  | `VALIDATION_ERROR` | `page` or `limit` is not a valid integer in range |
| `401`  | `UNAUTHORIZED`     | Missing or invalid `Bearer` token                 |
| `403`  | `FORBIDDEN`        | Authenticated user role is not `head_of_team`     |

## Permission Category

### `GET /api/v1/permission-categories`

Status: **Implemented** (`BE-S4-03`, partial `AC-13.01`: category list and download permission status API; UI toggle `FE-S4-03` and AC verification `QA-S4-01` remain planned).

Authorization:

- Requires authentication (`Bearer` access token).
- Allowed role: `head_of_team` (`member_team` and `admin` receive `403 FORBIDDEN`).

Query parameters:

| Parameter | Type    | Default | Constraints         | Description                         |
| --------- | ------- | ------- | ------------------- | ----------------------------------- |
| `limit`   | integer | `50`    | `1 <= limit <= 100` | Maximum number of categories listed |

Behavior:

- Returns categories ordered alphabetically (`name ASC, id ASC`) with their Member Team download permission status (`downloadEnabled`).
- Reads `categories` with a `LEFT JOIN` on `category_download_permissions`. Categories without a permission record or newly auto-created categories default to `downloadEnabled: false`.
- Returns `"data": []` when no categories exist.

Response (`200 OK`):

```json
{
  "success": true,
  "data": [
    {
      "id": "11111111-1111-4111-8111-111111111111",
      "name": "Contract",
      "slug": "contract",
      "downloadEnabled": true,
      "createdAt": "2026-09-22T00:00:00.000Z",
      "updatedAt": "2026-09-22T00:00:00.000Z"
    },
    {
      "id": "22222222-2222-4222-8222-222222222222",
      "name": "Reporting",
      "slug": "reporting",
      "downloadEnabled": false,
      "createdAt": "2026-09-22T00:00:00.000Z",
      "updatedAt": "2026-09-22T00:00:00.000Z"
    }
  ]
}
```

Item fields (`PermissionCategory` in `@axentra/shared`):

| Field             | Type            | Purpose                                                |
| ----------------- | --------------- | ------------------------------------------------------ |
| `id`              | `string` (UUID) | Category identifier                                    |
| `name`            | `string`        | Category display name                                  |
| `slug`            | `string`        | URL-friendly category slug                             |
| `downloadEnabled` | `boolean`       | Whether Member Team can download documents in category |
| `createdAt`       | `string` (ISO)  | Category creation timestamp                            |
| `updatedAt`       | `string` (ISO)  | Category last update timestamp                         |

Error responses:

| Status | Code               | When                                          |
| ------ | ------------------ | --------------------------------------------- |
| `400`  | `VALIDATION_ERROR` | `limit` is not a valid integer in `1..100`    |
| `401`  | `UNAUTHORIZED`     | Missing or invalid `Bearer` token             |
| `403`  | `FORBIDDEN`        | Authenticated user role is not `head_of_team` |

### `PATCH /api/v1/permission-categories/:categoryId`

Status: **Implemented** (`BE-S4-04`, partial `AC-13.01`: category download permission toggle API and API-level download gating; UI toggle `FE-S4-03` and AC verification `QA-S4-01` remain planned).

Authorization:

- Requires authentication (`Bearer` access token).
- Allowed role: `head_of_team` (`member_team` and `admin` receive `403 FORBIDDEN`).

Path parameters (`PermissionCategoryIdParam` in `@axentra/shared`):

| Parameter    | Type            | Constraints | Description                |
| ------------ | --------------- | ----------- | -------------------------- |
| `categoryId` | `string` (UUID) | Valid UUID  | Target category identifier |

Request body (`UpdatePermissionCategoryRequest` in `@axentra/shared`):

```json
{
  "downloadEnabled": true
}
```

| Field             | Type      | Required | Description                                                |
| ----------------- | --------- | -------- | ---------------------------------------------------------- |
| `downloadEnabled` | `boolean` | Yes      | Whether Member Team can download documents in the category |

Behavior:

- Runs inside a database transaction: updates `categories.updated_at`, upserts `category_download_permissions` (`download_enabled`, `updated_at`) for `categoryId`, and writes an immutable audit event to `category_permission_audit_events` with category details, actor (`head_of_team` user ID, name, email), previous permission state, new permission state, and timestamp.
- When `downloadEnabled` is `true`, `member_team` can download documents assigned to that category (`AC-13.01`).
- When `downloadEnabled` is `false`, `member_team` downloads for documents in that category are rejected with `403 FORBIDDEN`.
- New auto-created categories default to `downloadEnabled: false` until toggled active by `head_of_team`.

Response (`200 OK`):

```json
{
  "success": true,
  "data": {
    "id": "22222222-2222-4222-8222-222222222222",
    "name": "Reporting",
    "slug": "reporting",
    "downloadEnabled": true,
    "createdAt": "2026-09-22T00:00:00.000Z",
    "updatedAt": "2026-11-02T09:00:00.000Z"
  }
}
```

Error responses:

| Status | Code               | When                                                                            |
| ------ | ------------------ | ------------------------------------------------------------------------------- |
| `400`  | `VALIDATION_ERROR` | `categoryId` is not a valid UUID, or body is not `{ downloadEnabled: boolean }` |
| `401`  | `UNAUTHORIZED`     | Missing or invalid `Bearer` token                                               |
| `403`  | `FORBIDDEN`        | Authenticated user role is not `head_of_team`                                   |
| `404`  | `NOT_FOUND`        | Category with `categoryId` does not exist                                       |
