# Analytics API

Source: BA user story US-11 (AC-11.01, AC-11.02).

The Analytics Summary API is implemented in BE-S4-01.

## Implemented Endpoint

```text
GET /api/v1/analytics/summary
```

## Summary Metrics

### `GET /api/v1/analytics/summary`

Returns document usage metrics for the Head of Team analytics dashboard (`Dasbor analitik`).

- **Status:** Implemented (BE-S4-01 / Sprint 4)
- **Authorization:** Requires authenticated session (`Bearer <token>`) and role `head_of_team`. Callers with role `member_team` or `admin` receive `403 FORBIDDEN`.

#### Metrics

| Metric              | Type      | Description                                                                                       |
| ------------------- | --------- | ------------------------------------------------------------------------------------------------- |
| `totalDocuments`    | `integer` | Total number of active uploaded documents in the system (`deleted_at IS NULL` with stored file)   |
| `uploadedLast7Days` | `integer` | Number of active uploaded documents created within the last 7 days (`created_at >= now - 7 days`) |

#### Response schema

Success (`200 OK`):

```json
{
  "success": true,
  "data": {
    "totalDocuments": 42,
    "uploadedLast7Days": 8
  }
}
```

**Error responses:**

- `401 UNAUTHORIZED`: Missing, invalid, or expired Bearer token.
- `403 FORBIDDEN`: Authenticated user does not have role `head_of_team`.

## Open Decisions

- Whether metrics are global or scoped to team/category (currently global across all active documents per AC-11.01).
- Whether analytics count failed uploads (rejected uploads never persist a document row; persisted active documents are counted across processing states).
- Whether duplicate upload attempts appear as a separate metric.
