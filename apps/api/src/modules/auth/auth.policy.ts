const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export const ACCESS_TOKEN_TTL_MS = 15 * MINUTE_MS;
// Refresh lifetime when the user chose remember_me. The absolute lifetime below still applies.
export const REMEMBER_ME_REFRESH_TTL_MS = 30 * DAY_MS;
// Idle timeout for sessions without remember_me. Each successful refresh pushes it forward.
export const SESSION_IDLE_TTL_MS = 12 * HOUR_MS;
// Maximum lifetime of any session, counted from login.
export const SESSION_ABSOLUTE_TTL_MS = 30 * DAY_MS;

export const LOGIN_FAILURE_LIMIT = 5;
export const LOGIN_FAILURE_WINDOW_MS = 15 * MINUTE_MS;
export const LOGIN_LOCKOUT_MS = 15 * MINUTE_MS;

export type LoginAttemptState = {
  failedCount: number;
  windowStartedAt: Date;
  lockedUntil: Date | null;
};

export type LoginAttemptDecision = {
  allowed: boolean;
  state: LoginAttemptState;
};

export function computeRefreshExpiry(input: {
  now: Date;
  rememberMe: boolean;
  createdAt: Date;
}): Date {
  const idleExpiryMs =
    input.now.getTime() + (input.rememberMe ? REMEMBER_ME_REFRESH_TTL_MS : SESSION_IDLE_TTL_MS);
  const absoluteExpiryMs = input.createdAt.getTime() + SESSION_ABSOLUTE_TTL_MS;
  return new Date(Math.min(idleExpiryMs, absoluteExpiryMs));
}

// The state of an email with no recorded attempt. A store that must create its row before it can lock it
// inserts this state; reserving from it decides exactly like reserving from no row.
export function emptyLoginAttemptState(now: Date): LoginAttemptState {
  return { failedCount: 0, windowStartedAt: now, lockedUntil: null };
}

// Records one login attempt for an email. The fifth attempt inside the window starts the lockout, and
// every attempt while the lockout lasts is refused without checking the password.
export function reserveLoginAttempt(
  previous: LoginAttemptState | null,
  now: Date,
): LoginAttemptDecision {
  const nowMs = now.getTime();
  if (
    previous !== null &&
    previous.lockedUntil !== null &&
    previous.lockedUntil.getTime() > nowMs
  ) {
    return { allowed: false, state: previous };
  }

  const windowOpen =
    previous !== null && previous.windowStartedAt.getTime() + LOGIN_FAILURE_WINDOW_MS > nowMs;
  if (previous === null || !windowOpen) {
    return { allowed: true, state: { failedCount: 1, windowStartedAt: now, lockedUntil: null } };
  }

  const failedCount = previous.failedCount + 1;
  return {
    allowed: true,
    state: {
      failedCount,
      windowStartedAt: previous.windowStartedAt,
      lockedUntil: failedCount >= LOGIN_FAILURE_LIMIT ? new Date(nowMs + LOGIN_LOCKOUT_MS) : null,
    },
  };
}
