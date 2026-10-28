import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import {
  authLoginAttempts,
  authRotatedRefreshTokens,
  authSessions,
  users,
  type DatabaseClient,
  type closeDatabase as CloseDatabase,
  type createDatabaseClient as CreateDatabaseClient,
} from "@axentra/db";
import { createAuthService } from "../apps/api/src/modules/auth/auth.service";
import { DrizzleAuthSessionStore } from "../apps/api/src/modules/auth/auth.session.repository";
import { DrizzleLoginAttemptStore } from "../apps/api/src/modules/auth/auth.login-attempt.repository";
import { DrizzleAuthUserRepository } from "../apps/api/src/modules/auth/auth.user.repository";
import { normalizeEmail, sha256Hex } from "../apps/api/src/modules/auth/auth.tokens";
import { createPasswordVerifier } from "../apps/api/src/modules/auth/auth.password";
import { createDatabaseAuthenticator } from "../apps/api/src/modules/auth/runtime-authenticator";
import { createLogger } from "@axentra/observability";

const runIntegrationTests = Bun.env.RUN_INTEGRATION_TESTS === "1";

// Bun 1.3.12 never settles `expect(promise).rejects` for these auth calls after a timestamp decode, while
// the same rejection awaited through `.then` settles at once (see docs/DECISIONS.md, F2).
// The assertion is unchanged: the promise must reject with the expected HTTP status.
async function expectRejectionStatus(promise: Promise<unknown>, status: number): Promise<void> {
  const failure = await promise.then(
    () => undefined,
    (error: unknown) => error,
  );
  expect(failure).toMatchObject({ status });
}
const integrationTest = runIntegrationTests ? test : test.skip;

const PASSWORD = "integration-password";
const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

type Fixture = {
  userId: string;
  email: string;
};

type Clock = { now: Date };

describe("Durable auth sessions PostgreSQL integration (FND-10 A1-A6)", () => {
  let database: DatabaseClient | undefined;
  let closeDatabase: typeof CloseDatabase;
  let createDatabaseClient: typeof CreateDatabaseClient;

  beforeAll(async () => {
    if (!runIntegrationTests) return;

    const [{ loadApiConfigFromRuntime }, db] = await Promise.all([
      import("@axentra/config"),
      import("@axentra/db"),
    ]);
    closeDatabase = db.closeDatabase;
    createDatabaseClient = db.createDatabaseClient;
    const config = loadApiConfigFromRuntime();
    database = createDatabaseClient(config.DATABASE_URL);
    await db.checkDatabase(database);
  });

  afterAll(async () => {
    if (database !== undefined) await closeDatabase(database);
  });

  function requireDatabase(): DatabaseClient {
    if (database === undefined) {
      throw new Error("PostgreSQL integration database was not initialized");
    }
    return database;
  }

  // Seeds a users row exactly as the seed does, with a caller-chosen password hash.
  async function seedUser(client: DatabaseClient, passwordHash: string): Promise<Fixture> {
    const userId = crypto.randomUUID();
    const email = `auth-session-${userId}@axentra.local`;
    await client.db.insert(users).values({
      id: userId,
      email,
      name: "Auth Session Test User",
      passwordHash,
      role: "head_of_team",
    });
    return { userId, email };
  }

  // Deleting the user cascades to its sessions and their rotated refresh-token hashes.
  async function removeFixture(client: DatabaseClient, fixture: Fixture): Promise<void> {
    await client.db.delete(users).where(eq(users.id, fixture.userId));
    await client.db
      .delete(authLoginAttempts)
      .where(eq(authLoginAttempts.emailHash, sha256Hex(normalizeEmail(fixture.email))));
  }

  function buildService(client: DatabaseClient, clock: Clock) {
    return createAuthService({
      authenticator: createDatabaseAuthenticator(
        new DrizzleAuthUserRepository(client.db),
        createPasswordVerifier({
          logger: createLogger({
            service: "axentra-api",
            environment: "test",
            version: "0.1.0",
            level: "fatal",
          }),
        }),
      ),
      sessionStore: new DrizzleAuthSessionStore(client.db),
      loginAttemptStore: new DrizzleLoginAttemptStore(client.db),
      clock: () => clock.now,
    });
  }

  async function sessionRowsFor(client: DatabaseClient, fixture: Fixture) {
    return client.db.select().from(authSessions).where(eq(authSessions.userId, fixture.userId));
  }

  integrationTest(
    "stores only SHA-256 hashes of the tokens and the remember_me lifetime (A2)",
    async () => {
      const client = requireDatabase();
      const fixture = await seedUser(
        client,
        await Bun.password.hash(PASSWORD, { algorithm: "argon2id" }),
      );
      try {
        const clock: Clock = { now: new Date() };
        const service = buildService(client, clock);

        const session = await service.login({
          email: fixture.email,
          password: PASSWORD,
          rememberMe: true,
        });

        const rows = await sessionRowsFor(client, fixture);
        expect(rows).toHaveLength(1);
        const row = rows[0];
        expect(row?.accessTokenHash).toBe(sha256Hex(session.token));
        expect(row?.refreshTokenHash).toBe(sha256Hex(session.refreshToken));
        expect(row?.accessTokenHash).not.toBe(session.token);
        expect(row?.refreshTokenHash).not.toBe(session.refreshToken);
        expect(row?.rememberMe).toBe(true);
        expect(row?.revokedAt).toBeNull();
        expect(row?.refreshExpiresAt.getTime()).toBe(clock.now.getTime() + 30 * DAY_MS);
      } finally {
        await removeFixture(client, fixture);
      }
    },
  );

  integrationTest(
    "rotates the stored hashes on refresh and keeps the previous refresh hash (A2)",
    async () => {
      const client = requireDatabase();
      const fixture = await seedUser(
        client,
        await Bun.password.hash(PASSWORD, { algorithm: "argon2id" }),
      );
      try {
        const service = buildService(client, { now: new Date() });
        const first = await service.login({ email: fixture.email, password: PASSWORD });

        const second = await service.refresh(first.refreshToken);

        const row = (await sessionRowsFor(client, fixture))[0];
        expect(row?.accessTokenHash).toBe(sha256Hex(second.token));
        expect(row?.refreshTokenHash).toBe(sha256Hex(second.refreshToken));
        const rotated = await client.db
          .select()
          .from(authRotatedRefreshTokens)
          .where(eq(authRotatedRefreshTokens.tokenHash, sha256Hex(first.refreshToken)));
        expect(rotated).toHaveLength(1);
        expect(rotated[0]?.sessionId).toBe(row?.id);
      } finally {
        await removeFixture(client, fixture);
      }
    },
  );

  integrationTest("reuse of a rotated refresh token revokes the session row (A2)", async () => {
    const client = requireDatabase();
    const fixture = await seedUser(
      client,
      await Bun.password.hash(PASSWORD, { algorithm: "argon2id" }),
    );
    try {
      const service = buildService(client, { now: new Date() });
      const first = await service.login({ email: fixture.email, password: PASSWORD });
      const second = await service.refresh(first.refreshToken);

      await expectRejectionStatus(service.refresh(first.refreshToken), 401);

      expect((await sessionRowsFor(client, fixture))[0]?.revokedAt).not.toBeNull();
      await expectRejectionStatus(service.refresh(second.refreshToken), 401);
      expect(await service.tokenVerifier.verifyToken(second.token)).toBeNull();
    } finally {
      await removeFixture(client, fixture);
    }
  });

  integrationTest(
    "concurrent refreshes with one token leave exactly one winner and a revoked session (A2)",
    async () => {
      const client = requireDatabase();
      const fixture = await seedUser(
        client,
        await Bun.password.hash(PASSWORD, { algorithm: "argon2id" }),
      );
      try {
        const service = buildService(client, { now: new Date() });
        const session = await service.login({ email: fixture.email, password: PASSWORD });

        const outcomes = await Promise.allSettled([
          service.refresh(session.refreshToken),
          service.refresh(session.refreshToken),
        ]);

        expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
        expect((await sessionRowsFor(client, fixture))[0]?.revokedAt).not.toBeNull();
      } finally {
        await removeFixture(client, fixture);
      }
    },
  );

  integrationTest("logout revokes the session row and its access token (A2)", async () => {
    const client = requireDatabase();
    const fixture = await seedUser(
      client,
      await Bun.password.hash(PASSWORD, { algorithm: "argon2id" }),
    );
    try {
      const service = buildService(client, { now: new Date() });
      const session = await service.login({ email: fixture.email, password: PASSWORD });

      await service.logout(session.refreshToken);

      expect((await sessionRowsFor(client, fixture))[0]?.revokedAt).not.toBeNull();
      expect(await service.tokenVerifier.verifyToken(session.token)).toBeNull();
    } finally {
      await removeFixture(client, fixture);
    }
  });

  integrationTest(
    "a user seeded with the dummy placeholder hash cannot log in and gets no session (A1)",
    async () => {
      const client = requireDatabase();
      const fixture = await seedUser(client, "dummy-hash");
      try {
        const service = buildService(client, { now: new Date() });

        await expectRejectionStatus(
          service.login({ email: fixture.email, password: PASSWORD }),
          401,
        );
        expect(await sessionRowsFor(client, fixture)).toHaveLength(0);
      } finally {
        await removeFixture(client, fixture);
      }
    },
  );

  integrationTest(
    "five failed logins lock the email in auth_login_attempts, and success clears the row (A6)",
    async () => {
      const client = requireDatabase();
      const fixture = await seedUser(
        client,
        await Bun.password.hash(PASSWORD, { algorithm: "argon2id" }),
      );
      try {
        const clock: Clock = { now: new Date() };
        const service = buildService(client, clock);
        for (let attempt = 0; attempt < 5; attempt += 1) {
          await expectRejectionStatus(
            service.login({ email: fixture.email, password: "wrong-password" }),
            401,
          );
        }
        await expectRejectionStatus(
          service.login({ email: fixture.email, password: PASSWORD }),
          429,
        );

        const emailHash = sha256Hex(normalizeEmail(fixture.email));
        const locked = await client.db
          .select()
          .from(authLoginAttempts)
          .where(eq(authLoginAttempts.emailHash, emailHash));
        expect(locked[0]?.failedCount).toBe(5);
        expect(locked[0]?.lockedUntil).not.toBeNull();

        clock.now = new Date(clock.now.getTime() + 15 * MINUTE_MS);
        const session = await service.login({ email: fixture.email, password: PASSWORD });

        expect(session.token.startsWith("ax_")).toBe(true);
        const cleared = await client.db
          .select()
          .from(authLoginAttempts)
          .where(eq(authLoginAttempts.emailHash, emailHash));
        expect(cleared).toHaveLength(0);
      } finally {
        await removeFixture(client, fixture);
      }
    },
  );
});
