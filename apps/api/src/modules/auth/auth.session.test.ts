import { describe, expect, it } from "bun:test";
import type { LoginRequest } from "@axentra/shared";
import { UnauthorizedError } from "../../http/errors";
import { createAuthService } from "./auth.service";
import {
  createInMemoryAuthService,
  InMemoryAuthSessionStore,
  InMemoryLoginAttemptStore,
} from "./auth.memory-stores";
import { sha256Hex } from "./auth.tokens";
import { TEST_MEMBER } from "./auth.test-support";

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

function createClock(start: string): { now: () => Date; advance: (ms: number) => void } {
  let current = new Date(start);
  return {
    now: () => current,
    advance: (ms: number) => {
      current = new Date(current.getTime() + ms);
    },
  };
}

function createTestService(clock: { now: () => Date }) {
  return createInMemoryAuthService({
    authenticator: (credentials: LoginRequest) =>
      credentials.email === TEST_MEMBER.email && credentials.password === "correct-password"
        ? TEST_MEMBER
        : null,
    clock: clock.now,
  });
}

async function expectRejected(operation: Promise<unknown>): Promise<void> {
  await expect(operation).rejects.toBeInstanceOf(UnauthorizedError);
}

describe("auth session lifecycle (service)", () => {
  it("login issues distinct access and refresh tokens and stores only their hashes", async () => {
    const clock = createClock("2026-10-27T08:00:00.000Z");
    const sessionStore = new InMemoryAuthSessionStore();
    const service = createAuthService({
      authenticator: () => TEST_MEMBER,
      sessionStore,
      loginAttemptStore: new InMemoryLoginAttemptStore(),
      clock: clock.now,
    });

    const session = await service.login({ email: TEST_MEMBER.email, password: "x" });

    expect(session.token.startsWith("ax_")).toBe(true);
    expect(session.refreshToken.startsWith("ax_rt_")).toBe(true);
    expect(session.token).not.toBe(session.refreshToken);
    expect(session.expiresAt).toBe("2026-10-27T08:15:00.000Z");
    expect(await sessionStore.findByAccessTokenHash(session.token)).toBeNull();
    expect(await sessionStore.findByAccessTokenHash(sha256Hex(session.token))).not.toBeNull();
    expect(await sessionStore.findByRefreshTokenHash(session.refreshToken)).toBeNull();
    expect(
      await sessionStore.findByRefreshTokenHash(sha256Hex(session.refreshToken)),
    ).not.toBeNull();
  });

  it("refresh rotates both tokens and rejects the previous ones", async () => {
    const clock = createClock("2026-10-27T08:00:00.000Z");
    const service = createTestService(clock);
    const first = await service.login({ email: TEST_MEMBER.email, password: "correct-password" });

    const second = await service.refresh(first.refreshToken);

    expect(second.token).not.toBe(first.token);
    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect(await service.tokenVerifier.verifyToken(first.token)).toBeNull();
    expect(await service.tokenVerifier.verifyToken(second.token)).toEqual(TEST_MEMBER);
    await expectRejected(service.refresh(first.refreshToken));
  });

  it("reuse of an earlier rotated refresh token revokes the whole session", async () => {
    const clock = createClock("2026-10-27T08:00:00.000Z");
    const service = createTestService(clock);
    const first = await service.login({ email: TEST_MEMBER.email, password: "correct-password" });
    const second = await service.refresh(first.refreshToken);
    const third = await service.refresh(second.refreshToken);

    await expectRejected(service.refresh(first.refreshToken));

    await expectRejected(service.refresh(third.refreshToken));
    expect(await service.tokenVerifier.verifyToken(third.token)).toBeNull();
  });

  it("concurrent refreshes with the same token: one succeeds and the other revokes the session", async () => {
    const clock = createClock("2026-10-27T08:00:00.000Z");
    const service = createTestService(clock);
    const session = await service.login({ email: TEST_MEMBER.email, password: "correct-password" });

    const outcomes = await Promise.allSettled([
      service.refresh(session.refreshToken),
      service.refresh(session.refreshToken),
    ]);

    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    const winner = outcomes.find((outcome) => outcome.status === "fulfilled");
    if (winner?.status !== "fulfilled") throw new Error("expected one refresh to succeed");
    expect(await service.tokenVerifier.verifyToken(winner.value.token)).toBeNull();
  });

  it("logout revokes the access token and the refresh token", async () => {
    const clock = createClock("2026-10-27T08:00:00.000Z");
    const service = createTestService(clock);
    const session = await service.login({ email: TEST_MEMBER.email, password: "correct-password" });

    const result = await service.logout(session.refreshToken);

    expect(result.message).toBe("Logout berhasil");
    expect(await service.tokenVerifier.verifyToken(session.token)).toBeNull();
    await expectRejected(service.refresh(session.refreshToken));
  });

  it("logout accepts a missing or unknown refresh token and still succeeds", async () => {
    const clock = createClock("2026-10-27T08:00:00.000Z");
    const service = createTestService(clock);

    expect((await service.logout(undefined)).message).toBe("Logout berhasil");
    expect((await service.logout("ax_rt_unknown")).message).toBe("Logout berhasil");
  });

  it("access tokens stop verifying after 15 minutes", async () => {
    const clock = createClock("2026-10-27T08:00:00.000Z");
    const service = createTestService(clock);
    const session = await service.login({ email: TEST_MEMBER.email, password: "correct-password" });

    clock.advance(15 * MINUTE_MS - 1000);
    expect(await service.tokenVerifier.verifyToken(session.token)).toEqual(TEST_MEMBER);

    clock.advance(1000);
    expect(await service.tokenVerifier.verifyToken(session.token)).toBeNull();
  });

  it("a session without remember_me idles out after 12 hours, and each refresh extends the idle window", async () => {
    const clock = createClock("2026-10-27T08:00:00.000Z");
    const service = createTestService(clock);
    let refreshToken = (
      await service.login({ email: TEST_MEMBER.email, password: "correct-password" })
    ).refreshToken;

    clock.advance(11 * HOUR_MS);
    const afterFirstRefresh = await service.refresh(refreshToken);
    refreshToken = afterFirstRefresh.refreshToken;

    clock.advance(11 * HOUR_MS);
    const afterSecondRefresh = await service.refresh(refreshToken);
    refreshToken = afterSecondRefresh.refreshToken;

    clock.advance(13 * HOUR_MS);
    await expectRejected(service.refresh(refreshToken));
  });

  it("a remember_me session lasts 30 days from login and then rejects refresh", async () => {
    const clock = createClock("2026-10-27T08:00:00.000Z");
    const service = createTestService(clock);
    let refreshToken = (
      await service.login({
        email: TEST_MEMBER.email,
        password: "correct-password",
        rememberMe: true,
      })
    ).refreshToken;

    clock.advance(20 * DAY_MS);
    refreshToken = (await service.refresh(refreshToken)).refreshToken;

    clock.advance(10 * DAY_MS - MINUTE_MS);
    refreshToken = (await service.refresh(refreshToken)).refreshToken;

    clock.advance(MINUTE_MS);
    await expectRejected(service.refresh(refreshToken));
  });

  it("the 30-day absolute lifetime caps a session that keeps refreshing without remember_me", async () => {
    const clock = createClock("2026-10-27T08:00:00.000Z");
    const service = createTestService(clock);
    let refreshToken = (
      await service.login({ email: TEST_MEMBER.email, password: "correct-password" })
    ).refreshToken;

    let elapsedHours = 0;
    while (elapsedHours + 11 <= 30 * 24) {
      clock.advance(11 * HOUR_MS);
      elapsedHours += 11;
      refreshToken = (await service.refresh(refreshToken)).refreshToken;
    }

    clock.advance(11 * HOUR_MS);
    await expectRejected(service.refresh(refreshToken));
  });

  it("a revoked session does not verify even before its access token expires", async () => {
    const clock = createClock("2026-10-27T08:00:00.000Z");
    const service = createTestService(clock);
    const session = await service.login({ email: TEST_MEMBER.email, password: "correct-password" });

    await service.logout(session.refreshToken);
    clock.advance(MINUTE_MS);

    expect(await service.tokenVerifier.verifyToken(session.token)).toBeNull();
  });
});
