# Authentication API

Authentication is not listed as a BA user story, but it is a technical prerequisite for enforcing
Member Team and Head of Team behavior.

## Planned Endpoints

```text
POST /api/v1/auth/login
POST /api/v1/auth/refresh
POST /api/v1/auth/logout
GET  /api/v1/auth/me
```

## Planned Rules

- Passwords must never be logged.
- Role and permission checks must be enforced server-side.
- Member Team and Head of Team access must not rely only on hidden Web navigation.
- Session strategy must be approved before implementation.

## Current Status

Authentication is deferred in Foundation v0.1.0.
