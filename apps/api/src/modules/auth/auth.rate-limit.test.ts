import { describe, expect, it } from "bun:test";
import { createApp } from "../../app";
import type { ApiErrorEnvelope } from "@axentra/shared";
import { emptyLoginAttemptState, reserveLoginAttempt, type LoginAttemptState } from "./auth.policy";
import { createInMemoryAuthService } from "./auth.memory-stores";
import { jsonPost, logger, TEST_MEMBER } from "./auth.test-support";

const MINUTE_MS = 60 * 1000;
const START = new Date("2026-10-27T08:00:00.000Z");

function at(offsetMs: number): Date {
  return new Date(START.getTime() + offsetMs);
}

describe("reserveLoginAttempt (A6 policy)", () => {
  it("allows five attempts in the window and refuses the sixth while the lockout lasts", () => {
    let state: LoginAttemptState | null = null;
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const decision = reserveLoginAttempt(state, at(attempt * MINUTE_MS));
      expect(decision.allowed).toBe(true);
      state = decision.state;
    }

    expect(state?.failedCount).toBe(5);
    expect(state?.lockedUntil).toEqual(at(5 * MINUTE_MS + 15 * MINUTE_MS));
    expect(reserveLoginAttempt(state, at(6 * MINUTE_MS)).allowed).toBe(false);
  });

  it("opens a new window once the 15-minute lockout has ended", () => {
    const locked: LoginAttemptState = {
      failedCount: 5,
      windowStartedAt: at(0),
      lockedUntil: at(15 * MINUTE_MS),
    };

    const decision = reserveLoginAttempt(locked, at(15 * MINUTE_MS));

    expect(decision.allowed).toBe(true);
    expect(decision.state).toEqual({
      failedCount: 1,
      windowStartedAt: at(15 * MINUTE_MS),
      lockedUntil: null,
    });
  });

  it("decides from the row the upsert inserts exactly as from no row at all (F32)", () => {
    const now = at(0);

    const fromInsertedRow = reserveLoginAttempt(emptyLoginAttemptState(now), now);

    expect(fromInsertedRow).toEqual(reserveLoginAttempt(null, now));
    expect(fromInsertedRow).toEqual({
      allowed: true,
      state: { failedCount: 1, windowStartedAt: now, lockedUntil: null },
    });
  });

  it("restarts the count when the failures are spread over more than the 15-minute window", () => {
    let state: LoginAttemptState | null = null;
    for (const offsetMs of [0, MINUTE_MS, 2 * MINUTE_MS, 3 * MINUTE_MS]) {
      state = reserveLoginAttempt(state, at(offsetMs)).state;
    }

    const decision = reserveLoginAttempt(state, at(16 * MINUTE_MS));

    expect(decision.allowed).toBe(true);
    expect(decision.state.failedCount).toBe(1);
    expect(decision.state.lockedUntil).toBeNull();
  });
});

describe("POST /api/v1/auth/login rate limit (A6)", () => {
  function createLimitedApp(clockRef: { now: Date }) {
    const authService = createInMemoryAuthService({
      authenticator: (credentials) =>
        credentials.email.toLowerCase() === TEST_MEMBER.email &&
        credentials.password === "correct-password"
          ? TEST_MEMBER
          : null,
      clock: () => clockRef.now,
    });
    return createApp({ logger, version: "0.1.0", readinessChecks: [], authService });
  }

  async function attempt(
    app: ReturnType<typeof createLimitedApp>,
    email: string,
    password: string,
  ): Promise<Response> {
    return app.request("/api/v1/auth/login", jsonPost({ email, password }));
  }

  it("answers 401 for five failures and 429 for the next attempt, even with the right password", async () => {
    const clockRef = { now: START };
    const app = createLimitedApp(clockRef);

    for (let index = 0; index < 5; index += 1) {
      const response = await attempt(app, TEST_MEMBER.email, "wrong-password");
      expect(response.status).toBe(401);
    }

    const locked = await attempt(app, TEST_MEMBER.email, "correct-password");
    expect(locked.status).toBe(429);
    const body = (await locked.json()) as ApiErrorEnvelope;
    expect(body.error.code).toBe("TOO_MANY_REQUESTS");
    expect(locked.headers.getSetCookie()).toEqual([]);
  });

  it("accepts the correct password again once the 15-minute lockout has passed", async () => {
    const clockRef = { now: START };
    const app = createLimitedApp(clockRef);
    for (let index = 0; index < 5; index += 1) {
      await attempt(app, TEST_MEMBER.email, "wrong-password");
    }

    clockRef.now = new Date(START.getTime() + 15 * MINUTE_MS);
    const response = await attempt(app, TEST_MEMBER.email, "correct-password");

    expect(response.status).toBe(200);
  });

  it("a successful login resets the failure count", async () => {
    const clockRef = { now: START };
    const app = createLimitedApp(clockRef);
    for (let index = 0; index < 4; index += 1) {
      await attempt(app, TEST_MEMBER.email, "wrong-password");
    }
    expect((await attempt(app, TEST_MEMBER.email, "correct-password")).status).toBe(200);

    for (let index = 0; index < 5; index += 1) {
      const response = await attempt(app, TEST_MEMBER.email, "wrong-password");
      expect(response.status).toBe(401);
    }
    expect((await attempt(app, TEST_MEMBER.email, "correct-password")).status).toBe(429);
  });

  it("normalizes the email, so case variants share one failure counter", async () => {
    const clockRef = { now: START };
    const app = createLimitedApp(clockRef);
    for (let index = 0; index < 3; index += 1) {
      await attempt(app, "SAMI@axentra.internal", "wrong-password");
    }
    for (let index = 0; index < 2; index += 1) {
      await attempt(app, TEST_MEMBER.email, "wrong-password");
    }

    expect((await attempt(app, "Sami@Axentra.Internal", "correct-password")).status).toBe(429);
  });

  it("applies the same limit to an email that has no account", async () => {
    const clockRef = { now: START };
    const app = createLimitedApp(clockRef);
    for (let index = 0; index < 5; index += 1) {
      expect((await attempt(app, "nobody@axentra.internal", "any-password")).status).toBe(401);
    }

    expect((await attempt(app, "nobody@axentra.internal", "any-password")).status).toBe(429);
  });
});
