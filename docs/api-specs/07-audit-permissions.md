# Audit and Permission Category API

Source: BA user stories US-12 and US-13.

These APIs are planned and not implemented in Foundation v1.0.0.

## Download Audit Trail

### `GET /api/v1/audit/downloads`

Planned behavior:

- Head of Team can view download activity.
- Each row shows who downloaded, which document, and when the download happened.

Planned fields:

| Field          | Purpose                        |
| -------------- | ------------------------------ |
| `userId`       | Downloading user identifier    |
| `userName`     | Downloading user display name  |
| `documentId`   | Downloaded document identifier |
| `documentName` | Downloaded document name       |
| `downloadedAt` | Download timestamp             |

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
