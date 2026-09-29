# Search, Tags, and Categories API

Source: BA user stories US-04, US-05, US-06.

The Top Tags API is implemented in BE-S2-02. Search Documents and Categories remain planned.

## Implemented Endpoints

```text
GET /api/v1/tags/top
```

## Planned Endpoints

```text
GET /api/v1/search/documents
GET /api/v1/categories
```

## Search Documents

### `GET /api/v1/search/documents`

Planned query parameters:

| Parameter    | Purpose                       |
| ------------ | ----------------------------- |
| `q`          | Keyword from title or content |
| `tags`       | One or more Smart Tags        |
| `categoryId` | Auto category filter          |
| `page`       | Page number                   |
| `limit`      | Page size                     |

Planned behavior:

- Search by any keyword from document content or title.
- Return results in less than 3 seconds.
- Each result displays filename and matching text snippet.
- If no result exists, show `Tidak ada hasil yang ditemukan`.

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

This endpoint only supplies the tag choices relevant to a context. It does not apply tag filters to document results; single-tag and multi-tag filtering remain in BE-S2-03.

## Categories

### `GET /api/v1/categories`

Planned behavior:

- Return auto-created and configured categories.
- Include download permission state for Head of Team views.
- Member Team category visibility must respect authorization.
