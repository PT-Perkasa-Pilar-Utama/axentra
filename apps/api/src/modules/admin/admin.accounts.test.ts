import { describe, expect, test } from "bun:test";
import { createLogger } from "@axentra/observability";
import {
  adminUserListResponseSchema,
  updateAdminUserStatusResponseSchema,
  type ApiErrorEnvelope,
  type AuthUser,
} from "@axentra/shared";
import { createApp } from "../../app";
import type { TokenVerifier } from "../../middleware/auth";
import { createAdminService } from "./admin.service";
import {
  InMemoryAdminAccountRepository,
  type ManagedAccountRow,
} from "./admin.accounts.repository";
import { createAdminAccountService } from "./admin.accounts.service";

// Covers BE-S4-06 through the HTTP route: list, deactivate, reactivate, and the rejection rules.
const testLogger = createLogger({
  service: "axentra-api",
  environment: "test",
  version: "0.1.0",
  level: "fatal",
});

const fixedNow = new Date("2026-11-06T09:00:00.000Z");

const ADMIN: AuthUser = {
  id: "00000000-0000-4000-8000-0000000000a1",
  email: "admin@axentra.local",
  role: "admin",
  name: "Admin Test",
};
const HEAD: AuthUser = {
  id: "00000000-0000-4000-8000-0000000000b1",
  email: "head@axentra.local",
  role: "head_of_team",
  name: "Head Test",
};
const MEMBER: AuthUser = {
  id: "00000000-0000-4000-8000-0000000000c1",
  email: "member@axentra.local",
  role: "member_team",
  name: "Member Test",
};
const MEMBER_TWO_ID = "00000000-0000-4000-8000-0000000000c2";
const SECOND_HEAD_ID = "00000000-0000-4000-8000-0000000000b2";
const UNKNOWN_ID = "00000000-0000-4000-8000-0000000000ff";

const tokenVerifier: TokenVerifier = {
  verifyToken(token: string): AuthUser | null {
    const byToken: Record<string, AuthUser> = {
      "admin-token": ADMIN,
      "head-token": HEAD,
      "member-token": MEMBER,
    };
    return byToken[token] ?? null;
  },
};

function account(
  overrides: Partial<ManagedAccountRow> & Pick<ManagedAccountRow, "id">,
): ManagedAccountRow {
  return {
    name: null,
    email: `${overrides.id}@axentra.local`,
    role: "member_team",
    status: "active",
    ...overrides,
  };
}

function seedRepository(
  accounts: ReadonlyArray<ManagedAccountRow>,
): InMemoryAdminAccountRepository {
  const repository = new InMemoryAdminAccountRepository();
  repository.addAccount(
    account({ id: ADMIN.id, name: ADMIN.name ?? null, email: ADMIN.email, role: "admin" }),
  );
  for (const row of accounts) repository.addAccount(row);
  return repository;
}

function buildApp(repository: InMemoryAdminAccountRepository) {
  return createApp({
    logger: testLogger,
    version: "0.1.0",
    readinessChecks: [],
    tokenVerifier,
    adminService: createAdminService(),
    adminAccountService: createAdminAccountService(repository, { now: () => fixedNow }),
  });
}

async function patchStatus(
  app: ReturnType<typeof buildApp>,
  id: string,
  body: unknown,
  token = "admin-token",
): Promise<Response> {
  return await app.request(`/api/v1/admin/users/${id}/status`, {
    method: "PATCH",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("GET /api/v1/admin/users", () => {
  test("lists Member Team and Head of Team accounts by email with pagination meta and no admin accounts", async () => {
    const repository = seedRepository([
      account({ id: MEMBER_TWO_ID, name: "Rina", email: "rina@axentra.local" }),
      account({ id: MEMBER.id, name: "Budi", email: "budi@axentra.local" }),
      account({ id: HEAD.id, name: "Dimas", email: "dimas@axentra.local", role: "head_of_team" }),
    ]);
    const app = buildApp(repository);

    const response = await app.request("/api/v1/admin/users?limit=2&page=1", {
      headers: { authorization: "Bearer admin-token" },
    });

    expect(response.status).toBe(200);
    const body = adminUserListResponseSchema.parse(await response.json());
    expect(body.data.map((item) => item.email)).toEqual([
      "budi@axentra.local",
      "dimas@axentra.local",
    ]);
    const roles: string[] = body.data.map((item) => item.role);
    expect(roles).not.toContain("admin");
    expect(body.meta).toEqual({ page: 1, limit: 2, total: 3 });
  });

  test("returns 400 VALIDATION_ERROR for an out-of-range page or limit", async () => {
    const app = buildApp(seedRepository([]));

    for (const query of ["page=0", "page=1001", "limit=0", "limit=101", "page=abc", "limit=1.5"]) {
      const response = await app.request(`/api/v1/admin/users?${query}`, {
        headers: { authorization: "Bearer admin-token" },
      });
      expect(response.status).toBe(400);
      const body = (await response.json()) as ApiErrorEnvelope;
      expect(body.error.code).toBe("VALIDATION_ERROR");
    }
  });

  test("returns 401 without a token and 403 for head_of_team and member_team", async () => {
    const app = buildApp(seedRepository([]));

    const anonymous = await app.request("/api/v1/admin/users");
    expect(anonymous.status).toBe(401);

    for (const token of ["head-token", "member-token"]) {
      const response = await app.request("/api/v1/admin/users", {
        headers: { authorization: `Bearer ${token}` },
      });
      expect(response.status).toBe(403);
      const body = (await response.json()) as ApiErrorEnvelope;
      expect(body.error.code).toBe("FORBIDDEN");
    }
  });
});

describe("PATCH /api/v1/admin/users/:id/status", () => {
  test("deactivates a member, revokes its sessions, and writes an audit record with the actor", async () => {
    const repository = seedRepository([
      account({ id: MEMBER.id, name: "Budi", email: "budi@axentra.local" }),
    ]);
    repository.addSession("session-1", MEMBER.id);
    const app = buildApp(repository);

    const response = await patchStatus(app, MEMBER.id, { status: "inactive" });

    expect(response.status).toBe(200);
    const body = updateAdminUserStatusResponseSchema.parse(await response.json());
    expect(body.data).toEqual({ id: MEMBER.id, role: "member_team", status: "inactive" });
    expect(repository.accounts.get(MEMBER.id)?.status).toBe("inactive");
    expect(repository.isSessionRevoked("session-1")).toBe(true);
    expect(repository.auditRecords).toEqual([
      {
        userId: MEMBER.id,
        userName: "Budi",
        userEmail: "budi@axentra.local",
        previousStatus: "active",
        newStatus: "inactive",
        actorUserId: ADMIN.id,
        actorName: "Admin Test",
        actorEmail: ADMIN.email,
        changedAt: fixedNow,
      },
    ]);
    expect(repository.transactionCount).toBe(1);
  });

  test("reactivates an inactive account and records the change without restoring revoked sessions", async () => {
    const repository = seedRepository([account({ id: MEMBER.id, status: "inactive" })]);
    repository.addSession("session-old", MEMBER.id);
    await repository.revokeActiveSessions(MEMBER.id, fixedNow);
    const app = buildApp(repository);

    const response = await patchStatus(app, MEMBER.id, { status: "active" });

    expect(response.status).toBe(200);
    expect(repository.accounts.get(MEMBER.id)?.status).toBe("active");
    expect(repository.isSessionRevoked("session-old")).toBe(true);
    expect(repository.auditRecords[0]?.newStatus).toBe("active");
  });

  test("returns 200 with no change and no audit record when the account already has that status", async () => {
    const repository = seedRepository([account({ id: MEMBER.id })]);
    const app = buildApp(repository);

    const response = await patchStatus(app, MEMBER.id, { status: "active" });

    expect(response.status).toBe(200);
    expect(repository.auditRecords).toHaveLength(0);
  });

  test("returns 404 NOT_FOUND for an unknown account id", async () => {
    const app = buildApp(seedRepository([]));

    const response = await patchStatus(app, UNKNOWN_ID, { status: "inactive" });

    expect(response.status).toBe(404);
    const body = (await response.json()) as ApiErrorEnvelope;
    expect(body.error.code).toBe("NOT_FOUND");
    expect(body.error.message).toBe("Pengguna tidak ditemukan");
  });

  test("rejects an admin target with 422 INVALID_TARGET_ROLE and changes nothing", async () => {
    const repository = seedRepository([]);
    const app = buildApp(repository);

    const response = await patchStatus(app, ADMIN.id, { status: "inactive" });

    expect(response.status).toBe(422);
    const body = (await response.json()) as ApiErrorEnvelope;
    expect(body.error.code).toBe("INVALID_TARGET_ROLE");
    expect(repository.accounts.get(ADMIN.id)?.status).toBe("active");
    expect(repository.auditRecords).toHaveLength(0);
  });

  test("rejects deactivating the last active Head of Team with 422 LAST_HEAD_OF_TEAM", async () => {
    const repository = seedRepository([account({ id: HEAD.id, role: "head_of_team" })]);
    const app = buildApp(repository);

    const response = await patchStatus(app, HEAD.id, { status: "inactive" });

    expect(response.status).toBe(422);
    const body = (await response.json()) as ApiErrorEnvelope;
    expect(body.error.code).toBe("LAST_HEAD_OF_TEAM");
    expect(repository.accounts.get(HEAD.id)?.status).toBe("active");
    expect(repository.auditRecords).toHaveLength(0);
  });

  test("allows deactivating one Head of Team while another stays active", async () => {
    const repository = seedRepository([
      account({ id: HEAD.id, role: "head_of_team" }),
      account({ id: SECOND_HEAD_ID, role: "head_of_team" }),
    ]);
    const app = buildApp(repository);

    const response = await patchStatus(app, HEAD.id, { status: "inactive" });

    expect(response.status).toBe(200);
    expect(repository.accounts.get(HEAD.id)?.status).toBe("inactive");
  });

  test("rejects a body that is not exactly { status: active | inactive } with 400", async () => {
    const repository = seedRepository([account({ id: MEMBER.id })]);
    const app = buildApp(repository);

    const bodies = [{ status: "suspended" }, {}, { status: "inactive", role: "admin" }, "not-json"];
    for (const body of bodies) {
      const response = await patchStatus(app, MEMBER.id, body);
      expect(response.status).toBe(400);
      const envelope = (await response.json()) as ApiErrorEnvelope;
      expect(envelope.error.code).toBe("VALIDATION_ERROR");
    }
    expect(repository.accounts.get(MEMBER.id)?.status).toBe("active");
  });

  test("rejects a malformed account id with 400", async () => {
    const app = buildApp(seedRepository([]));

    const response = await patchStatus(app, "not-a-uuid", { status: "inactive" });

    expect(response.status).toBe(400);
  });

  test("returns 401 without a token and 403 for head_of_team", async () => {
    const repository = seedRepository([account({ id: MEMBER.id })]);
    const app = buildApp(repository);

    const anonymous = await app.request(`/api/v1/admin/users/${MEMBER.id}/status`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "inactive" }),
    });
    expect(anonymous.status).toBe(401);

    const head = await patchStatus(app, MEMBER.id, { status: "inactive" }, "head-token");
    expect(head.status).toBe(403);
    expect(repository.accounts.get(MEMBER.id)?.status).toBe("active");
  });
});
