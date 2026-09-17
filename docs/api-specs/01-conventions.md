# API Conventions

## Base URL

All API endpoints live under:

```text
/api/v1
```

## Success Envelope

```json
{
  "success": true,
  "data": {}
}
```

With pagination:

```json
{
  "success": true,
  "data": [],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 100
  }
}
```

## Error Envelope

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Data tidak valid",
    "details": [
      {
        "field": "name",
        "message": "Required"
      }
    ]
  }
}
```

## Rules

- Technical codes use stable English uppercase identifiers.
- User-facing messages use Bahasa Indonesia.
- Handlers return only sanitized errors.
- Mutations must be idempotent where the workflow allows it.
- Endpoints must not return raw storage keys unless the caller is authorized for that document.
- Document content must not be logged.

## Common Status Codes

| Status | Meaning                         |
| ------ | ------------------------------- |
| `200`  | Success                         |
| `201`  | Created                         |
| `400`  | Validation or malformed request |
| `401`  | Authentication required         |
| `403`  | Authenticated but forbidden     |
| `404`  | Resource not found              |
| `409`  | Conflict                        |
| `413`  | Payload too large               |
| `415`  | Unsupported media type          |
| `422`  | Business validation failed      |
| `429`  | Rate limited                    |
| `500`  | Internal server error           |
