import crypto from "node:crypto";

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import type * as DbModule from "@axentra/db";
import { createLogger } from "@axentra/observability";
import {
  adminUserListResponseSchema,
  updateAdminUserStatusResponseSchema,
  type ApiErrorEnvelope,
} from "@axentra/shared";
import { createApp } from "../apps/api/src/app";
import { createPasswordVerifier } from "../apps/api/src/modules/auth/auth.password";
import { DrizzleLoginAttemptStore } from "../apps/api/src/modules/auth/auth.login-attempt.repository";
import { DrizzleAuthSessionStore } from "../apps/api/src/modules/auth/auth.session.repository";
import { createAuthService } from "../apps/api/src/modules/auth/auth.service";
import { DrizzleAuthUserRepository } from "../apps/api/src/modules/auth/auth.user.repository";
import { createLocalIdentityAuthenticator } from "../apps/api/src/modules/auth/local-identity";
import { createDatabaseAuthenticator } from "../apps/api/src/modules/auth/runtime-authenticator";
import { DrizzleAdminRepository } from "../apps/api/src/modules/admin/admin.repository";
import { createAdminService } from "../apps/api/src/modules/admin/admin.service";
import {
  DrizzleAdminAccountRepository,
  type IAdminAccountRepository,
} from "../apps/api/src/modules/admin/admin.accounts.repository";
import { createAdminAccountService } from "../apps/api/src/modules/admin/admin.accounts.service";
import {
  assertClientConnectedToDisposableDatabase,
  assertDisposableTestDatabase,
} from "./helpers/disposable-database";

// BE-S4-06 against PostgreSQL: deactivation revokes sessions and blocks login on the production path and on the
// development identity-directory path, last-Head-of-Team protection holds under concurrency, and every change is audited.
const runIntegrationTests = Bun.env.RUN_INTEGRATION_TESTS === "1";
const integrationTest = runIntegrationTests ? test : test.skip;

const logger = createLogger({
  service: "axentra-api",
  environment: "test",
  version: "0.1.0",
  level: "fatal",
});
const PASSWORD = "integration-password-123";
const WRONG_CREDENTIALS = {
  status: 401,
  code: "UNAUTHORIZED",
  message: "Email atau kata sandi salah",
};

let dbModule: typeof DbModule | undefined;
let database: DbModule.DatabaseClient | undefined;
const createdUserIds: string[] = [];

function ready(): { client: DbModule.DatabaseClient; schema: typeof DbModule } {
  if (dbModule === undefined || database === undefined) {
    throw new Error("PostgreSQL integration database was not initialized");
  }
  return { client: database, schema: dbModule };
}

function firstOrThrow<T>(rows: readonly T[], label: string): T {
  const [first] = rows;
  if (first === undefined) throw new Error(`${label} returned no rows`);
  return first;
}

async function createAccount(
  role: "member_team" | "head_of_team" | "admin",
  status: "active" | "inactive" = "active",
): Promise<{ id: string; email: string }> {
  const { client, schema } = ready();
  const email = `${role}-${crypto.randomUUID()}@axentra.invalid`;
  const passwordHash = await Bun.password.hash(PASSWORD, { algorithm: "argon2id" });
  const row = firstOrThrow(
    await client.db
      .insert(schema.users)
      .values({ email, passwordHash, role, status, name: `${role} test` })
      .returning({ id: schema.users.id, email: schema.users.email }),
    "insert account",
  );
  createdUserIds.push(row.id);
  return row;
}

function buildApp(adminAccountService?: ReturnType<typeof createAdminAccountService>) {
  const { client } = ready();
  const userRepository = new DrizzleAuthUserRepository(client.db);
  const authService = createAuthService({
    authenticator: createDatabaseAuthenticator(userRepository, createPasswordVerifier({ logger })),
    sessionStore: new DrizzleAuthSessionStore(client.db),
    loginAttemptStore: new DrizzleLoginAttemptStore(client.db),
  });
  return createApp({
    logger,
    version: "0.1.0",
    readinessChecks: [],
    authService,
    adminService: createAdminService(new DrizzleAdminRepository(client.db)),
    adminAccountService:
      adminAccountService ??
      createAdminAccountService(new DrizzleAdminAccountRepository(client.db)),
  });
}

type App = ReturnType<typeof buildApp>;

async function login(app: App, email: string, password = PASSWORD): Promise<Response> {
  return app.request("/api/v1/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
}

async function tokenFor(app: App, email: string): Promise<string> {
  const response = await login(app, email);
  expect(response.status).toBe(200);
  const body = (await response.json()) as { data: { token: string } };
  return body.data.token;
}

function patchStatus(app: App, token: string, userId: string, status: "active" | "inactive") {
  return app.request(`/api/v1/admin/users/${userId}/status`, {
    method: "PATCH",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ status }),
  });
}

// Keeps exactly the given Heads of Team active for a test, and restores the others afterwards.
async function isolateActiveHeads(keepActive: ReadonlyArray<string>): Promise<() => Promise<void>> {
  const { client, schema } = ready();
  const others = await client.db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(and(eq(schema.users.role, "head_of_team"), eq(schema.users.status, "active")));
  const toDeactivate = others.map((row) => row.id).filter((id) => !keepActive.includes(id));
  if (toDeactivate.length > 0) {
    await client.db
      .update(schema.users)
      .set({ status: "inactive" })
      .where(inArray(schema.users.id, toDeactivate));
  }
  return async () => {
    if (toDeactivate.length > 0) {
      await client.db
        .update(schema.users)
        .set({ status: "active" })
        .where(inArray(schema.users.id, toDeactivate));
    }
  };
}

async function statusOf(userId: string): Promise<string> {
  const { client, schema } = ready();
  const row = firstOrThrow(
    await client.db
      .select({ status: schema.users.status })
      .from(schema.users)
      .where(eq(schema.users.id, userId)),
    "select status",
  );
  return row.status;
}

// Holds the first transaction for a while after it has taken the Head of Team lock. Without the lock, a
// second deactivation would read both heads as active and both would pass the last-head check.
class HoldFirstHeadLockRepository implements IAdminAccountRepository {
  public constructor(
    private readonly inner: IAdminAccountRepository,
    private readonly hold: { applied: boolean },
  ) {}

  public listManagedAccounts(limit: number, offset: number) {
    return this.inner.listManagedAccounts(limit, offset);
  }

  public runInTransaction<T>(work: (tx: IAdminAccountRepository) => Promise<T>): Promise<T> {
    return this.inner.runInTransaction((tx) =>
      work(new HoldFirstHeadLockRepository(tx, this.hold)),
    );
  }

  public async lockActiveHeadOfTeamIds(): Promise<ReadonlyArray<string>> {
    const ids = await this.inner.lockActiveHeadOfTeamIds();
    if (!this.hold.applied) {
      this.hold.applied = true;
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
    return ids;
  }

  public findAccountForUpdate(userId: string) {
    return this.inner.findAccountForUpdate(userId);
  }

  public setStatus(userId: string, status: "active" | "inactive", changedAt: Date) {
    return this.inner.setStatus(userId, status, changedAt);
  }

  public revokeActiveSessions(userId: string, revokedAt: Date) {
    return this.inner.revokeActiveSessions(userId, revokedAt);
  }

  public insertStatusAudit(record: Parameters<IAdminAccountRepository["insertStatusAudit"]>[0]) {
    return this.inner.insertStatusAudit(record);
  }
}

describe("Admin account management PostgreSQL integration (BE-S4-06)", () => {
  beforeAll(async () => {
    if (!runIntegrationTests) return;

    const [{ loadApiConfigFromRuntime }, db] = await Promise.all([
      import("@axentra/config"),
      import("@axentra/db"),
    ]);
    const config = loadApiConfigFromRuntime();
    assertDisposableTestDatabase(config.DATABASE_URL);
    dbModule = db;
    database = db.createDatabaseClient(config.DATABASE_URL);
    assertClientConnectedToDisposableDatabase(database, config.DATABASE_URL);
    await db.checkDatabase(database);
  });

  afterAll(async () => {
    if (database === undefined || dbModule === undefined) return;
    const { client, schema } = ready();
    if (createdUserIds.length > 0) {
      await client.db
        .delete(schema.accountStatusAuditEvents)
        .where(
          or(
            inArray(schema.accountStatusAuditEvents.userId, createdUserIds),
            inArray(schema.accountStatusAuditEvents.actorUserId, createdUserIds),
          ),
        );
      await client.db.delete(schema.users).where(inArray(schema.users.id, createdUserIds));
    }
    await dbModule.closeDatabase(database);
  });

  integrationTest(
    "a deactivated member loses its session and cannot log in again, and the change is audited",
    async () => {
      const { client, schema } = ready();
      const app = buildApp();
      const admin = await createAccount("admin");
      const member = await createAccount("member_team");
      const adminToken = await tokenFor(app, admin.email);
      const memberToken = await tokenFor(app, member.email);
      expect(
        (
          await app.request("/api/v1/auth/me", {
            headers: { authorization: `Bearer ${memberToken}` },
          })
        ).status,
      ).toBe(200);

      const response = await patchStatus(app, adminToken, member.id, "inactive");

      expect(response.status).toBe(200);
      const body = updateAdminUserStatusResponseSchema.parse(await response.json());
      expect(body.data).toEqual({ id: member.id, role: "member_team", status: "inactive" });
      expect(await statusOf(member.id)).toBe("inactive");

      expect(
        (
          await app.request("/api/v1/auth/me", {
            headers: { authorization: `Bearer ${memberToken}` },
          })
        ).status,
      ).toBe(401);
      const relogin = await login(app, member.email);
      expect(relogin.status).toBe(WRONG_CREDENTIALS.status);
      const envelope = (await relogin.json()) as ApiErrorEnvelope;
      expect(envelope.error.code).toBe(WRONG_CREDENTIALS.code);
      expect(envelope.error.message).toBe(WRONG_CREDENTIALS.message);

      const sessions = await client.db
        .select({ revokedAt: schema.authSessions.revokedAt })
        .from(schema.authSessions)
        .where(eq(schema.authSessions.userId, member.id));
      expect(sessions.length).toBeGreaterThan(0);
      expect(sessions.every((session) => session.revokedAt !== null)).toBe(true);

      const audit = await client.db
        .select({
          previousStatus: schema.accountStatusAuditEvents.previousStatus,
          newStatus: schema.accountStatusAuditEvents.newStatus,
          actorUserId: schema.accountStatusAuditEvents.actorUserId,
          actorEmail: schema.accountStatusAuditEvents.actorEmail,
        })
        .from(schema.accountStatusAuditEvents)
        .where(eq(schema.accountStatusAuditEvents.userId, member.id));
      expect(audit).toEqual([
        {
          previousStatus: "active",
          newStatus: "inactive",
          actorUserId: admin.id,
          actorEmail: admin.email,
        },
      ]);
    },
  );

  integrationTest("reactivating an account lets it log in again", async () => {
    const app = buildApp();
    const admin = await createAccount("admin");
    const member = await createAccount("member_team", "inactive");
    const adminToken = await tokenFor(app, admin.email);

    expect((await login(app, member.email)).status).toBe(401);
    const response = await patchStatus(app, adminToken, member.id, "active");

    expect(response.status).toBe(200);
    expect(await statusOf(member.id)).toBe("active");
    expect((await login(app, member.email)).status).toBe(200);
  });

  integrationTest("the list shows the current status of a deactivated member", async () => {
    const app = buildApp();
    const admin = await createAccount("admin");
    const member = await createAccount("member_team");
    const adminToken = await tokenFor(app, admin.email);
    expect((await patchStatus(app, adminToken, member.id, "inactive")).status).toBe(200);

    let found: { status: string } | undefined;
    for (let page = 1; page <= 50 && found === undefined; page += 1) {
      const response = await app.request(`/api/v1/admin/users?page=${page}&limit=100`, {
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const body = adminUserListResponseSchema.parse(await response.json());
      found = body.data.find((item) => item.id === member.id);
      if (body.data.length === 0) break;
    }

    expect(found?.status).toBe("inactive");
  });

  integrationTest("an admin account cannot be deactivated through the endpoint", async () => {
    const app = buildApp();
    const admin = await createAccount("admin");
    const otherAdmin = await createAccount("admin");
    const adminToken = await tokenFor(app, admin.email);

    const response = await patchStatus(app, adminToken, otherAdmin.id, "inactive");

    expect(response.status).toBe(422);
    const envelope = (await response.json()) as ApiErrorEnvelope;
    expect(envelope.error.code).toBe("INVALID_TARGET_ROLE");
    expect(await statusOf(otherAdmin.id)).toBe("active");
  });

  integrationTest("the last active Head of Team cannot be deactivated", async () => {
    const app = buildApp();
    const admin = await createAccount("admin");
    const head = await createAccount("head_of_team");
    const adminToken = await tokenFor(app, admin.email);
    const restore = await isolateActiveHeads([head.id]);
    try {
      const response = await patchStatus(app, adminToken, head.id, "inactive");

      expect(response.status).toBe(422);
      const envelope = (await response.json()) as ApiErrorEnvelope;
      expect(envelope.error.code).toBe("LAST_HEAD_OF_TEAM");
      expect(await statusOf(head.id)).toBe("active");
    } finally {
      await restore();
    }
  });

  integrationTest(
    "two concurrent deactivations of the last two active Heads of Team leave exactly one active",
    async () => {
      const app = buildApp();
      const admin = await createAccount("admin");
      const headA = await createAccount("head_of_team");
      const headB = await createAccount("head_of_team");
      const adminToken = await tokenFor(app, admin.email);
      const restore = await isolateActiveHeads([headA.id, headB.id]);
      try {
        const responses = await Promise.all([
          patchStatus(app, adminToken, headA.id, "inactive"),
          patchStatus(app, adminToken, headB.id, "inactive"),
        ]);

        const statuses = responses.map((response) => response.status).sort();
        expect(statuses).toEqual([200, 422]);
        const remaining = [await statusOf(headA.id), await statusOf(headB.id)].filter(
          (status) => status === "active",
        );
        expect(remaining).toHaveLength(1);
      } finally {
        await restore();
      }
    },
  );

  integrationTest(
    "a deactivation holding the Head of Team lock makes a concurrent one wait, then see the new state",
    async () => {
      const { client } = ready();
      const admin = await createAccount("admin");
      const headA = await createAccount("head_of_team");
      const headB = await createAccount("head_of_team");
      const restore = await isolateActiveHeads([headA.id, headB.id]);
      try {
        const hold = { applied: false };
        const app = buildApp(
          createAdminAccountService(
            new HoldFirstHeadLockRepository(new DrizzleAdminAccountRepository(client.db), hold),
          ),
        );
        const adminToken = await tokenFor(app, admin.email);

        const responses = await Promise.all([
          patchStatus(app, adminToken, headA.id, "inactive"),
          patchStatus(app, adminToken, headB.id, "inactive"),
        ]);

        expect(responses.map((response) => response.status).sort()).toEqual([200, 422]);
        const active = [await statusOf(headA.id), await statusOf(headB.id)].filter(
          (status) => status === "active",
        );
        expect(active).toHaveLength(1);
      } finally {
        await restore();
      }
    },
  );

  integrationTest(
    "development identity-directory login is rejected once the users row is inactive (O3)",
    async () => {
      const app = buildApp();
      const admin = await createAccount("admin");
      const member = await createAccount("member_team");
      const adminToken = await tokenFor(app, admin.email);
      const directory = Buffer.from(
        JSON.stringify([
          {
            id: member.id,
            email: member.email,
            role: "member_team",
            passwordHash: await Bun.password.hash(PASSWORD, { algorithm: "argon2id" }),
          },
        ]),
      ).toString("base64");
      const repository = new DrizzleAuthUserRepository(ready().client.db);
      const authenticator = createLocalIdentityAuthenticator(
        directory,
        createPasswordVerifier({ logger }),
        (userId) => repository.findStatusById(userId),
      );

      expect(await authenticator({ email: member.email, password: PASSWORD })).not.toBeNull();
      expect((await patchStatus(app, adminToken, member.id, "inactive")).status).toBe(200);
      expect(await authenticator({ email: member.email, password: PASSWORD })).toBeNull();
    },
  );

  integrationTest(
    "audit rows keep history with a null user when the account is deleted",
    async () => {
      const { client, schema } = ready();
      const app = buildApp();
      const admin = await createAccount("admin");
      const member = await createAccount("member_team");
      const adminToken = await tokenFor(app, admin.email);
      expect((await patchStatus(app, adminToken, member.id, "inactive")).status).toBe(200);

      await client.db.delete(schema.users).where(eq(schema.users.id, member.id));

      const audit = await client.db
        .select({
          userId: schema.accountStatusAuditEvents.userId,
          newStatus: schema.accountStatusAuditEvents.newStatus,
        })
        .from(schema.accountStatusAuditEvents)
        .where(eq(schema.accountStatusAuditEvents.actorUserId, admin.id));
      expect(audit).toEqual([{ userId: null, newStatus: "inactive" }]);
    },
  );

  integrationTest("the audit table rejects a status outside active and inactive", async () => {
    const { client } = ready();
    const admin = await createAccount("admin");

    const attempt = client.db.execute(
      sql`insert into account_status_audit_events (user_id, previous_status, new_status, actor_user_id, actor_email)
          values (null, 'active', 'suspended', ${admin.id}, ${admin.email})`,
    );

    await expect(Promise.resolve(attempt)).rejects.toThrow();
  });
});
