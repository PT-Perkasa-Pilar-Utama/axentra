# System API

System endpoints are implemented in Foundation v1.0.0.

## GET `/api/v1/health`

Reports process liveness without dependency I/O.

### Response `200`

```json
{
  "success": true,
  "data": {
    "status": "ok",
    "service": "axentra-api",
    "version": "0.1.0"
  }
}
```

## GET `/api/v1/health/ready`

Checks PostgreSQL, Redis, and Storage.

### Response `200`

```json
{
  "success": true,
  "data": {
    "status": "ready",
    "service": "axentra-api",
    "version": "0.1.0",
    "dependencies": {
      "database": "ready",
      "redis": "ready",
      "storage": "ready"
    }
  }
}
```

### Response `503`

```json
{
  "success": true,
  "data": {
    "status": "not_ready",
    "service": "axentra-api",
    "version": "0.1.0",
    "dependencies": {
      "database": "ready",
      "redis": "unavailable",
      "storage": "ready"
    }
  }
}
```

## Notes

- Readiness dependency checks are bounded.
- Liveness intentionally avoids dependency checks.
- These endpoints are the only implemented API routes in Foundation v1.0.0.
