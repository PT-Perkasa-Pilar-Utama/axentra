# Analytics API

Source: BA user story US-11.

These APIs are planned and not implemented in Foundation v0.1.0.

## Planned Endpoint

```text
GET /api/v1/analytics/summary
```

## Planned Metrics

| Metric              | Description                                     |
| ------------------- | ----------------------------------------------- |
| `totalDocuments`    | Total number of documents in the system         |
| `uploadedLast7Days` | Number of documents uploaded in the last 7 days |

## Authorization

- Intended persona: Head of Team.
- Member Team should not receive team-wide analytics unless approved.

## Open Decisions

- Whether metrics are global or scoped to team/category.
- Whether analytics count failed uploads.
- Whether duplicate upload attempts appear as a separate metric.
