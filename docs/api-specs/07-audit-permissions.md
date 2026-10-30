# Audit and Permission Category API

Source: BA user stories US-12 and US-13.

`GET /api/v1/audit/downloads` is implemented (`BE-S4-02`, `AC-12.01`). Permission category APIs remain planned.

## Download Audit Trail

### `GET /api/v1/audit/downloads`

Status: **Implemented** (`BE-S4-02`, `AC-12.01`).

Authorization:

- Requires authentication (`Bearer` access token).
- Allowed role: `head_of_team` (`member_team` and `admin` receive `403 FORBIDDEN`; extending access to `admin` is tracked separately under `BE-S4-08`).

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

Returns categories and their Member Team download permission status.

### `PATCH /api/v1/permission-categories/:categoryId`

Planned request:

```json
{
  "downloadEnabled": true
}
```

Planned behavior:

- Head of Team toggles category from inactive to active.
- When category is active, Member Team can download documents in that category.
- New auto-created categories default to inactive download permission.
