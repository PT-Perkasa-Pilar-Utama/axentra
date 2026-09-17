# Search, Tags, and Categories API

Source: BA user stories US-04, US-05, US-06.

These APIs are planned and not implemented in Foundation v0.1.0.

## Planned Endpoints

```text
GET /api/v1/search/documents
GET /api/v1/tags/top
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

Planned behavior:

- Return tags relevant to current search result or dashboard context.
- Support single-tag filter.
- Support multi-tag filter.
- Active tag filters are highlighted in Web UI.

## Categories

### `GET /api/v1/categories`

Planned behavior:

- Return auto-created and configured categories.
- Include download permission state for Head of Team views.
- Member Team category visibility must respect authorization.
