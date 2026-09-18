# Authentication API

Authentication is not listed as a separate BA user story, but it is a critical technical prerequisite
(`BE-S1-01`) for enforcing server-side user context and Role-Based Access Control (RBAC) across Axentra.

## Current Status

Implemented in `BE-S1-01`. The server-owned `TokenVerifier` boundary, fail-closed production verifier,
session lifecycle service, and `/api/v1/auth/me` endpoint are active.

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

Authenticates credentials and establishes a server-side session.

- **Body:**
  ```json
  {
    "email": "user@axentra.internal",
    "password": "string"
  }
  ```
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
      "refreshToken": "ax_rt_..."
    }
  }
  ```
- **Response 401 (Error Envelope):** Invalid email or password.
- **Production Guard:** Default production startup uses a fail-closed authenticator until the dedicated user database store is provisioned. Static/hardcoded credentials in code are strictly prohibited.

### 3. `POST /api/v1/auth/refresh`

Rotates an active session and issues a new access token.

- **Body / Header:** `{ "refreshToken": "ax_rt_..." }` or `Authorization: Bearer <refresh_token>`
- **Response 200 (Success Envelope):**
  ```json
  {
    "success": true,
    "data": {
      "token": "ax_...",
      "refreshToken": "ax_rt_..."
    }
  }
  ```
- **Semantics:** Refresh token rotation is mandatory; previous tokens are revoked upon successful refresh. Replaying revoked tokens returns 401.

### 4. `POST /api/v1/auth/logout`

Invalidates the active session.

- **Headers:** `Authorization: Bearer <access_token>`
- **Response 200 (Success Envelope):**
  ```json
  {
    "success": true,
    "data": {
      "message": "Logout berhasil"
    }
  }
  ```
- **Semantics:** Revokes the session record server-side. Subsequent requests with the revoked token are rejected with 401.

## Security & Architectural Rules

- **Server-Owned Verification:** Client-controlled identity headers (such as `x-user-id` or `x-user-role`) are never accepted or parsed in production. All authentication relies on cryptographically verified bearer tokens or signed sessions.
- **Fail-Closed Default:** Unconfigured or production startup defaults to `defaultTokenVerifier`, rejecting all tokens until an approved verifier/session adapter is wired.
- **Redaction:** Passwords, bearer tokens, and `Authorization` headers must never be logged.
- **Web Storage Contract:** The Web application must never store raw credentials in browser local storage. Tokens should be retained in memory or secure HTTP-only cookies.
