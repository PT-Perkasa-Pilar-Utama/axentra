# Authentication and Authorization

Authentication and authorization are not implemented in Foundation v0.1.0.

## Current Status

| Capability          | Status   |
| ------------------- | -------- |
| Login               | Deferred |
| Refresh token       | Deferred |
| Logout              | Deferred |
| User table          | Deferred |
| Role table or enum  | Deferred |
| Route authorization | Deferred |
| Client route gating | Deferred |

## Planned Principles

- Auth must be implemented server-side before protected business APIs are exposed.
- RBAC must be enforced by the API, not only by Web navigation.
- Document download must combine role, category permission, and operation.
- Token/session storage must be reviewed before implementation.
- Any auth endpoint must be covered by API specs, unit tests, and integration tests.

## BA Personas

These persona names come from the BA workbook.

| Persona      | Planned Purpose                                                                                   |
| ------------ | ------------------------------------------------------------------------------------------------- |
| Member Team  | Uploads documents, searches, previews, and downloads documents when category permission allows it |
| Head of Team | Views analytics, audits download activity, and manages category download permission               |
