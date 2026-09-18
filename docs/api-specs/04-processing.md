# Processing API

Source: BA user stories US-03, US-04, US-05.

These APIs are planned and not implemented in Foundation v0.1.0.

## Planned Endpoints

```text
GET /api/v1/documents/:id/metadata
GET /api/v1/documents/:id/smart-tags
GET /api/v1/documents/:id/category
```

## Metadata Extraction

Planned behavior:

- System processes uploaded documents.
- Metadata such as author is extracted automatically.
- Member Team can see extracted metadata on document detail.

## Smart Tags

Planned behavior:

- System generates relevant Smart Tags from document content.
- Maximum 3 tags are shown on each document card/detail.
- Top Tags bar updates when a new tag appears and is not already represented.

## Auto Category

Planned behavior:

- System assigns category based on document content.
- Example: content containing `Reporting` creates or maps to category `Reporting`.
- Multiple documents can be categorized into different categories based on content.
- New categories do not receive download permission by default.

## Processing State

Canonical processing states across database, queue, API, and Web:

- `queued`
- `processing`
- `completed`
- `failed`
