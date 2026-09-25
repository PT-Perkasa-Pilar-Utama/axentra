# Authentication and Authorization

Authentication and authorization establish verified identity and Role-Based Access Control (RBAC) across
Axentra's API and Web surfaces.

## Current Status

| Capability                     | Status      | Notes / Card                                                                           |
| ------------------------------ | ----------- | -------------------------------------------------------------------------------------- |
| Authenticated User Context     | Implemented | `BE-S1-01`: `user: AuthUser` (`id`, `email`, `role`, `name`) in `ApiEnvironment`       |
| Role Definition & Validation   | Implemented | `BE-S1-01`: `USER_ROLES` (`member_team`, `head_of_team`, `admin`) in `@axentra/shared` |
| Route Authorization Middleware | Implemented | `BE-S1-01`: `requireAuth(verifier)` and `requireRole(allowedRole)`                     |
| `/api/v1/auth/me`              | Implemented | `BE-S1-01`: Verified user profile endpoint                                             |
| Session & Token Lifecycle      | Implemented | `BE-S1-01`: `AuthService` with expiry, rotation, and logout invalidation               |
| Runtime identity directory     | Implemented | `BE-S1-01`: development/test directory issues session tokens                           |
| User persistence table         | Deferred    | Scheduled for dedicated identity store card                                            |
| Client route gating            | In Progress | Frontend integration with `/api/v1/auth/me`                                            |

## Approved Architecture & Token Strategy

### 1. Server-Owned Verification Boundary

Authentication must be validated server-side for every protected route. All protected endpoints consume
the unified `TokenVerifier` boundary:

```typescript
export type TokenVerifier = {
  verifyToken: (token: string) => Promise<AuthUser | null> | AuthUser | null;
};
```

- **Fail-Closed Default:** In production, unconfigured startup uses `defaultTokenVerifier`, which rejects all bearer tokens (`null`) until an authorized session store or verified token provider is injected.
- **Header Security:** Client-controlled identity headers (`x-user-id`, `x-user-role`, etc.) are strictly forbidden in production. Any request attempting identity header injection is rejected as unauthenticated.

### 2. Session and Token Lifecycle

- **Access Token:** Short-lived cryptographically random token (`ax_...`). Default TTL is 15 minutes.
- **Refresh Token:** Rotated on every use (`ax_rt_...`). Default TTL is 7 days.
- **Expiry:** Verifier automatically rejects tokens whose expiration timestamp has elapsed.
- **Revocation / Invalidation:** Calling `/api/v1/auth/logout` explicitly marks the session as revoked in the session registry. Subsequent requests with that token return `401 Unauthorized`.
- **Rotation:** Refreshing a session revokes the previous access and refresh tokens, mitigating replay attacks.

### 3. Role-Based Access Control (RBAC)

The platform roles and business personas are enforced via `requireRole(role)`:

| Persona / Role (`UserRole`) | Allowed Operations                                                                                                                            |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `member_team`               | Uploads documents, searches, previews, and downloads when category permission allows                                                          |
| `head_of_team`              | Views analytics, audits download activity, and manages category download permissions                                                          |
| `admin`                     | Authenticated platform role; does not replace `member_team` or `head_of_team` on a document route unless explicitly included in `requireRole` |

Route middleware evaluates:

1. `requireAuth(verifier)`: Verifies bearer token and stores `AuthUser` in `context.get("user")`.
2. `requireRole(role)`: Ensures `user.role === role`. Returns `403 Forbidden` (`Anda tidak memiliki akses untuk tindakan ini`) if mismatched.

### 4. Client Storage & Credential Rules

- The Web client must keep tokens in memory or secure HTTP-only cookies.
- Raw passwords and static tokens must never be hardcoded in tracked repository code or logged.
- The API redaction boundary redacts `Authorization` headers, cookies, and tokens from all structured logs.

### 5. App and Service Composition

- When `authService` is provided to `createApp({ authService })` without an explicit `tokenVerifier`, `createApp` automatically selects `dependencies.authService.tokenVerifier`. This guarantees that `/api/v1/auth/login`, `/api/v1/auth/me`, and all protected routes share the identical session registry.
- Development and test startup verify credentials against `AUTH_LOCAL_IDENTITY_DIRECTORY`. Production startup ignores that directory and rejects every credential login with 401. A missing or empty directory fails startup in every environment. Malformed directory contents fail startup only in development and test; production does not parse them. An unconfigured `createAuthService()` still rejects every login.
