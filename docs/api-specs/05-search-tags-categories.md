# Search, Tags, and Categories API

Source: BA user stories US-04, US-05, US-06.

The Top Tags API is implemented in BE-S2-02. Tag filtering for search and list endpoints is implemented in BE-S2-03. Full-text keyword and extracted content search with snippets is implemented in BE-S2-05. Category listing and auto-assignment are implemented in BE-S2-04.

## Implemented Endpoints

```text
GET /api/v1/tags/top
GET /api/v1/search/documents
GET /api/v1/categories
```

## Search Documents

### `GET /api/v1/search/documents`

Status: Implemented for title, filename, and extracted content search with snippets (BE-S2-05 / AC-06.01 to AC-06.04), single-tag and multi-tag filtering (BE-S2-03), and category filtering.

**Authorization:**

- Requires authenticated session (`Bearer <token>`).
- Enforces role `member_team` or `head_of_team`.

#### Query parameters:

| Parameter    | Required | Values / limit                  | Purpose                                                                                |
| ------------ | -------- | ------------------------------- | -------------------------------------------------------------------------------------- |
| `tags`       | No       | Repeated or CSV; max 20 tags    | Single-tag and multi-tag filtering (AND logic per AC-04.03, AC-04.04).                 |
| `tag`        | No       | String; max 50 chars            | Single-tag alias for `tags`.                                                           |
| `q`          | No       | String; max 100 chars           | Title, filename, and extracted content keyword filter with snippets. Alias: `keyword`. |
| `categoryId` | No       | Valid UUID                      | Auto-category filter.                                                                  |
| `page`       | No       | Integer `1`–`1000`; default `1` | Page number.                                                                           |
| `limit`      | No       | Integer `1`–`100`; default `20` | Page size.                                                                             |

#### Response schema

Success (`200 OK`):

```json
{
  "success": true,
  "data": [
    {
      "id": "11111111-1111-4111-8111-111111111111",
      "filename": "rencana-strategis.pdf",
      "processingStatus": "completed",
      "createdAt": "2026-09-22T00:00:00.000Z",
      "snippet": "Ringkasan rencana strategis manajemen dokumen perkasa...",
      "highlights": [
        {
          "start": 18,
          "end": 27
        }
      ]
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 1
  }
}
```

The `snippet` is returned as clean plain text without HTML markup to ensure safety and prevent XSS. Structured `highlights` (`{ start: number, end: number }[]`) provide character offsets of the matched keyword within `snippet`, allowing UI consumers to render highlight elements safely as native components (e.g. React elements) without interpreting document content as HTML. When searching without a keyword (e.g., tag-only filtering), `snippet` is `null`.

**Performance SLA (AC-06.03):**

Target response time is under 3 seconds (typically < 500 ms) for any keyword search across title, original filename, and extracted body text against a representative corpus of 100+ documents (~2 KB body text per document), accelerated by PostgreSQL GIN trigram indexes (`pg_trgm`).

If no document matches, returns `"data": []` with `"meta": { "total": 0 }`. The frontend displays `Tidak ada hasil yang ditemukan`.

**Error responses:**

- `400 VALIDATION_ERROR`: Invalid UUID, limit out of bounds, or tag exceeding 50 characters.
- `401 UNAUTHORIZED`: Missing or invalid Bearer token.
- `403 FORBIDDEN`: Role not permitted.

## Top Tags

### `GET /api/v1/tags/top`

Returns Smart Tags already associated with successfully processed, non-deleted documents. The endpoint
reads persisted tags on every request. Tags saved with a document by BE-S2-01 become eligible on
the next request without a cache invalidation step.

#### Query parameters

| Parameter     | Required | Values / limit                         | Meaning                                                      |
| ------------- | -------- | -------------------------------------- | ------------------------------------------------------------ |
| `context`     | Yes      | `dashboard` or `search`                | Selects which document set ranks tags.                       |
| `limit`       | No       | Integer `3`–`20`; default `10`         | Maximum list length; minimum fits up to three document tags. |
| `documentIds` | No       | Repeated UUID parameter; maximum `100` | Current search page IDs; only for `context=search`.          |

For `context=dashboard`, tags are ranked across all completed, non-deleted documents; `documentIds`
must be omitted. For `context=search`, rank tags attached to the supplied current-page result IDs.
Omit `documentIds` when the current search page has no results; the endpoint returns an empty list.
Clients must refresh this request after search results change.

“Top” prioritizes tags on the most recently tagged qualifying document in the selected context.
Recency uses the tag association's `created_at`; ties break by document ID descending. Those tags
appear first, sorted by `documentCount` descending and then `name` ascending. Remaining slots use
the same popularity order. A newly stored tag is eligible on the next request even when its
document count is below the usual top tags. The minimum `limit` of `3` covers the BE-S2-01 maximum
of three Smart Tags per document, and the response remains capped at `limit`. Only tags attached to
at least one qualifying document are returned.

#### Response schema

Success (`200`):

```json
{
  "success": true,
  "data": [
    {
      "id": "e2df3d9f-53ea-4aa6-9d49-8df47dd77a67",
      "name": "finance",
      "documentCount": 8
    }
  ]
}
```

`data` is an array of at most `limit` entries. Each `documentCount` is the number of distinct
qualifying documents carrying that tag, not the number of tag associations. An empty context
returns `"data": []`.

| Field           | Type      | Meaning                                                      |
| --------------- | --------- | ------------------------------------------------------------ |
| `id`            | UUID      | Persisted Smart Tag identifier.                              |
| `name`          | `string`  | Persisted normalized tag name.                               |
| `documentCount` | `integer` | Number of distinct qualifying documents in the selected set. |

Invalid or out-of-range parameters return `400` using the standard validation error envelope.
Unauthenticated requests return `401`; roles other than `member_team` and `head_of_team` return
`403`.

This endpoint only supplies the tag choices relevant to a context. Single-tag and multi-tag filtering is implemented in BE-S2-03 across search/list endpoints.

## Categories

### `GET /api/v1/categories`

Returns bounded auto-created and configured categories (AC-05.01).

- **Status:** Implemented (BE-S2-04 / Sprint 2)
- **Authorization:** Bearer token required. Allowed roles: `member_team`, `head_of_team`.

#### Query parameters

| Parameter | Type    | Required | Description                                                            |
| --------- | ------- | -------- | ---------------------------------------------------------------------- |
| `limit`   | integer | No       | Maximum number of categories to return. Min: 1, max: 100, default: 50. |

#### Response schema

Success (`200 OK`):

The response array is capped at a maximum of 100 categories (`CATEGORIES_MAX_LIMIT`).

```json
{
  "success": true,
  "data": [
    {
      "id": "11111111-1111-4111-8111-111111111111",
      "name": "Contract",
      "slug": "contract",
      "downloadEnabled": false,
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

If no categories exist, returns `"data": []`.

**Error responses:**

- `400 VALIDATION_ERROR`: Invalid `limit` parameter (e.g. non-numeric, `< 1`, or `> 100`).
- `401 UNAUTHORIZED`: Missing or invalid Bearer token.
- `403 FORBIDDEN`: Role not permitted.
