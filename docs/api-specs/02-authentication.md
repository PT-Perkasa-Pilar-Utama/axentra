# Authentication API

Authentication is not listed as a separate BA user story, but it is a critical technical prerequisite
(`BE-S1-01`) for enforcing server-side user context and Role-Based Access Control (RBAC) across Axentra.

## Current Status

Implemented in `BE-S1-01` and completed in `FND-10` (A1-A6). The server-owned `TokenVerifier` boundary,
the production authenticator backed by the `users` table, durable database sessions, the HttpOnly refresh
cookie, the login rate limit, and the `WEB_ORIGIN` CORS policy are active. `/api/v1/auth/me` is unchanged.

## Endpoints

### 1. `GET /api/v1/auth/me`

Retrieves the currently authenticated user's server-verified profile.

- **Headers:** `Authorization: Bearer <access_token>`
- **Response 200 (Success Envelope):**
  ```json
  {
    "success": true,
    "data": {
      "id": "11111111-1111-4111-8111-111111111111",
      "email": "sami@axentra.internal",
      "role": "member_team",
      "name": "Sami"
    }
  }
  ```
- **Response 401 (Error Envelope):** Missing, invalid, revoked, or expired token.

### 2. `POST /api/v1/auth/login`

Authenticates credentials and creates a durable session.

- **Body:**
  ```json
  {
    "email": "user@axentra.internal",
    "password": "string",
    "rememberMe": false
  }
  ```
  `rememberMe` is optional and defaults to `false`.
- **Response 200 (Success Envelope):**
  ```json
  {
    "success": true,
    "data": {
      "user": {
        "id": "uuid",
        "email": "user@axentra.internal",
        "role": "member_team",
        "name": "User Name"
      },
      "token": "ax_...",
      "expiresAt": "2026-10-27T08:15:00.000Z"
    }
  }
  ```
  The response also sets the `axentra_refresh` cookie described below. The refresh token is never returned in the body.
- **Errors:** `400 VALIDATION_ERROR` for an invalid body. `401 UNAUTHORIZED` (`Email atau kata sandi salah`) for an unknown email, a wrong password, or a user without a valid password hash. `429 TOO_MANY_REQUESTS` while the email is locked out (see Login Rate Limit).
- **Identity source:** When `APP_ENV` is `development` or `test`, login verifies against `AUTH_LOCAL_IDENTITY_DIRECTORY`, a base64 JSON array of `{ id, email, role, name?, passwordHash }` with Argon2id hashes. When `APP_ENV` is `production`, login verifies against the `users` table and takes the role from that row. Both paths use the same Argon2id verifier. A malformed or placeholder hash, such as `dummy-hash`, fails the login with 401. Sessions reference `users.id`, so a development or test identity must be seeded (`bun run db:seed`) before it can log in. Malformed directory contents fail startup only in development and test. Plaintext passwords stay out of tracked code.

### 3. `POST /api/v1/auth/refresh`

Rotates the session and issues a new access token.

- **Body:** none. The request is authenticated only by the `axentra_refresh` cookie.
- **Response 200 (Success Envelope):** the same shape as login (`user`, `token`, `expiresAt`). The response sets the rotated `axentra_refresh` cookie with the same `rememberMe` semantics as the login that created the session.
- **Response 401 (Error Envelope):** the cookie is missing, invalid, expired, or revoked. The response also clears the cookie (`Max-Age=0`).
- **Semantics:**
  - Every successful refresh rotates both the access token and the refresh token. The previous access token and refresh token stop working immediately.
  - Presenting a refresh token that was already rotated is reuse. The whole session is revoked and the request returns 401.
  - Clients must not send two refresh requests with the same cookie at the same time. The second request is treated as reuse and revokes the session, so the Web client must share one in-flight refresh.

### 4. `POST /api/v1/auth/logout`

Revokes the session identified by the refresh cookie.

- **Headers / Body:** none required. An expired access token does not block logout.
- **Response 200 (Success Envelope):**
  ```json
  {
    "success": true,
    "data": {
      "message": "Logout berhasil"
    }
  }
  ```
- **Semantics:** Marks the session revoked and clears the cookie. A request without a cookie still returns 200 and clears the cookie. Afterwards the access token and the refresh cookie both return 401.

## Refresh Cookie, Session Lifetimes, Rate Limit, and CORS

### Refresh cookie

| Attribute  | Value                                                                                                     |
| ---------- | --------------------------------------------------------------------------------------------------------- |
| `Name`     | `axentra_refresh`                                                                                         |
| `Value`    | The refresh token (`ax_rt_...`)                                                                           |
| `HttpOnly` | Always set                                                                                                |
| `SameSite` | `Lax`                                                                                                     |
| `Path`     | `/api/v1/auth`, so the cookie reaches both `/auth/refresh` and `/auth/logout`                             |
| `Secure`   | Only when `APP_ENV=production`                                                                            |
| `Max-Age`  | `2592000` (30 days) when `rememberMe` is `true`; omitted, which makes a browser-session cookie, otherwise |

### Session lifetimes

| Token or limit                     | Lifetime                                       |
| ---------------------------------- | ---------------------------------------------- |
| Access token                       | 15 minutes                                     |
| Refresh token, `rememberMe: true`  | 30 days                                        |
| Refresh token, `rememberMe: false` | 12 hours of idle time; each refresh extends it |
| Absolute session lifetime (both)   | 30 days from login                             |

### Login rate limit

After 5 failed login attempts for the same normalized email (trimmed and lowercased) within 15 minutes, that email is locked for 15 minutes. Locked attempts return `429 TOO_MANY_REQUESTS` without checking the password. A successful login clears the counter. The limit also applies to emails without an account. The email is stored only as a SHA-256 hash.

### CORS

Only `WEB_ORIGIN` (default `http://localhost:5173`) may call the API from a browser. Responses carry `Access-Control-Allow-Origin: <WEB_ORIGIN>` and `Access-Control-Allow-Credentials: true`. Allowed request headers are `Content-Type` and `Authorization`. Allowed methods are `GET`, `POST`, `PATCH`, `DELETE`, and `OPTIONS`. Other origins receive no allow-origin header.

## Security & Architectural Rules

- **Server-Owned Verification:** Client-controlled identity headers (such as `x-user-id` or `x-user-role`) are never accepted or parsed in production. All authentication relies on cryptographically verified bearer tokens or signed sessions.
- **Fail-Closed Default:** Unconfigured or production startup defaults to `defaultTokenVerifier`, rejecting all tokens until an approved verifier/session adapter is wired.
- **App & Service Composition:** When `authService` is provided to `createApp({ authService })` without an explicit `tokenVerifier`, `createApp` automatically selects `dependencies.authService.tokenVerifier`. This guarantees that `/api/v1/auth/login` and `/api/v1/auth/me` share the exact same session registry.
- **Redaction:** Passwords, bearer tokens, refresh tokens, cookie values, and `Authorization` headers must never be logged.
- **Web Storage Contract:** The Web application must never store raw credentials in browser local storage. The access token stays in memory. The refresh token lives only in the HttpOnly `axentra_refresh` cookie and is never readable from script.
