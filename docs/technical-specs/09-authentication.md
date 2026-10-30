# Authentication and Authorization

Authentication and authorization establish verified identity and Role-Based Access Control (RBAC) across
Axentra's API and Web surfaces.

## Current Status

| Capability                     | Status      | Notes / Card                                                                                           |
| ------------------------------ | ----------- | ------------------------------------------------------------------------------------------------------ |
| Authenticated User Context     | Implemented | `BE-S1-01`: `user: AuthUser` (`id`, `email`, `role`, `name`) in `ApiEnvironment`                       |
| Role Definition & Validation   | Implemented | `BE-S1-01`: `USER_ROLES` (`member_team`, `head_of_team`, `admin`) in `@axentra/shared`                 |
| Route Authorization Middleware | Implemented | `BE-S1-01`: `requireAuth(verifier)` and `requireRole(allowedRole)`                                     |
| `/api/v1/auth/me`              | Implemented | `BE-S1-01`: Verified user profile endpoint                                                             |
| Session & Token Lifecycle      | Implemented | `BE-S1-01`, `FND-10`: `AuthService` with expiry, rotation, reuse detection, and logout invalidation    |
| Durable sessions               | Implemented | `FND-10`: `auth_sessions` and `auth_rotated_refresh_tokens` store hashes only                          |
| Production identity            | Implemented | `FND-10`: production login verifies against the `users` table with the development verifier            |
| Runtime identity directory     | Implemented | `BE-S1-01`: development/test directory; sessions reference seeded `users` rows                         |
| Refresh cookie and CORS        | Implemented | `FND-10`: HttpOnly `axentra_refresh` cookie; CORS for `WEB_ORIGIN` only                                |
| Login rate limit               | Implemented | `FND-10`: 5 failures per normalized email in 15 minutes lock it for 15 minutes (`auth_login_attempts`) |
| Client route gating            | In Progress | Frontend integration with `/api/v1/auth/me`                                                            |

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

- **Session storage:** Sessions are durable and live in PostgreSQL. `auth_sessions` holds one row per session: `user_id`, SHA-256 hashes of the current access and refresh tokens, `remember_me`, `access_expires_at`, `refresh_expires_at`, `last_used_at`, `revoked_at`, and `created_at`. `auth_rotated_refresh_tokens` holds the SHA-256 hashes of refresh tokens that were rotated away, which makes reuse detectable. Raw tokens are never persisted, logged, or placed in a queue payload.
- **Access Token:** Short-lived random token (`ax_...`). Lifetime is 15 minutes. Verification rejects it when its expiry has passed, the session is revoked, or the session's refresh lifetime has ended.
- **Refresh Token:** Random token (`ax_rt_...`) carried only in the HttpOnly cookie. With `remember_me` its lifetime is 30 days. Without it, the lifetime is 12 hours of idle time, and each successful refresh pushes it forward. Every session also has an absolute lifetime of 30 days from login.
- **Rotation:** Each refresh replaces both tokens in one compare-and-swap update. The update succeeds only while the presented refresh token is still the session's current one. The previous access token and refresh token stop working.
- **Reuse detection:** Presenting a refresh token that was already rotated revokes the whole session and returns `401 Unauthorized`. A concurrent refresh that loses the rotation race is treated the same way.
- **Revocation / Invalidation:** `/api/v1/auth/logout` marks the session revoked. Its access token and refresh token are rejected with `401 Unauthorized` afterwards.
- **Expiry:** Expired and revoked sessions are rejected on every path: access verification, refresh, and logout. Logout is idempotent.

### 3. Role-Based Access Control (RBAC)

The platform roles and business personas are enforced via `requireRole(role)`:

| Persona / Role (`UserRole`) | Allowed Operations                                                                                                                            |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `member_team`               | Uploads documents, searches, and previews; downloads when category permission allows                                                          |
| `head_of_team`              | Views analytics, audits download activity, and manages category download permissions                                                          |
| `admin`                     | Authenticated platform role; does not replace `member_team` or `head_of_team` on a document route unless explicitly included in `requireRole` |

Route middleware evaluates:

1. `requireAuth(verifier)`: Verifies bearer token and stores `AuthUser` in `context.get("user")`.
2. `requireRole(role)`: Ensures `user.role === role`. Returns `403 Forbidden` (`Anda tidak memiliki akses untuk tindakan ini`) if mismatched.

### 4. Client Storage & Credential Rules

- The Web client keeps the access token in memory only. The refresh token is not readable from script.
- **Refresh cookie:** `axentra_refresh` is `HttpOnly` and `SameSite=Lax`, with `Path=/api/v1/auth` so both refresh and logout receive it. It is `Secure` only when `APP_ENV=production`. It carries `Max-Age=2592000` only when `rememberMe` is `true`; otherwise it is a browser-session cookie. A `401` from refresh clears it.
- **Browser origin:** Browsers may call the API with credentials only from `WEB_ORIGIN`. Other origins receive no allow-origin header.
- Raw passwords and static tokens must never be hardcoded in tracked repository code or logged.
- The API redaction boundary redacts `Authorization` headers, cookies, and tokens from all structured logs.

### 5. App and Service Composition

- When `authService` is provided to `createApp({ authService })` without an explicit `tokenVerifier`, `createApp` automatically selects `dependencies.authService.tokenVerifier`. This guarantees that `/api/v1/auth/login`, `/api/v1/auth/me`, and all protected routes share the identical session registry.
- Development and test startup verify credentials against `AUTH_LOCAL_IDENTITY_DIRECTORY`. Production verifies against the `users` table through `createRuntimeAuthenticator(config, { userRepository })`, with `DrizzleAuthUserRepository`, and takes the role from the stored row. A missing or empty directory fails startup in every environment. Malformed directory contents fail startup only in development and test.
- Session and login-attempt persistence are injected explicitly through `DrizzleAuthSessionStore` and `DrizzleLoginAttemptStore`. `createAuthService` requires these stores and has no default store. `createInMemoryAuthService` is for unit tests only.
- When no auth service is injected, the auth routes reject every login and refresh, and `/api/v1/auth/logout` still clears the cookie.

### 6. Login Rate Limit

- `auth_login_attempts` holds one row per SHA-256 hash of a normalized email (trimmed and lowercased). The row stores `failed_count`, `window_started_at`, and `locked_until`.
- The fifth attempt inside a 15-minute window locks the email for 15 minutes. Attempts during the lock return `429 TOO_MANY_REQUESTS` without checking the password. The limit applies to emails without an account as well.
- A successful login deletes the row. The state changes inside one transaction with a row lock, so concurrent attempts cannot bypass the limit.
