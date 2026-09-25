import { describe, expect, it } from "bun:test";
import {
  DUMMY_USERS,
  generateLocalIdentityDirectory,
  hashUserPassword,
  seedUsers,
  type SeededUserRecord,
} from "../src/seeds/users";
import { userRoleEnum } from "../src/schema/enums";
import type { DatabaseClient } from "../src/client";

describe("dummy user seed definitions", () => {
  it("contains exactly 4 dummy users", () => {
    expect(DUMMY_USERS.length).toBe(4);
  });

  it("contains 2 member_team, 1 head_of_team, and 1 admin", () => {
    const roles = DUMMY_USERS.map((u) => u.role);
    const members = roles.filter((r) => r === "member_team");
    const heads = roles.filter((r) => r === "head_of_team");
    const admins = roles.filter((r) => r === "admin");

    expect(members.length).toBe(2);
    expect(heads.length).toBe(1);
    expect(admins.length).toBe(1);
  });

  it("assigns valid enum roles to all dummy users", () => {
    for (const user of DUMMY_USERS) {
      expect(userRoleEnum.enumValues).toContain(user.role);
    }
  });

  it("uses expected emails and role-specific passwords", () => {
    const userMap = new Map(DUMMY_USERS.map((u) => [u.email, u]));

    const member1 = userMap.get("member1@axentra.local");
    const member2 = userMap.get("member2@axentra.local");
    const head = userMap.get("head@axentra.local");
    const admin = userMap.get("admin@axentra.local");

    expect(member1).toBeDefined();
    expect(member1?.role).toBe("member_team");
    expect(member1?.plainPassword).toBe("local-member-password");

    expect(member2).toBeDefined();
    expect(member2?.role).toBe("member_team");
    expect(member2?.plainPassword).toBe("local-member-password");

    expect(head).toBeDefined();
    expect(head?.role).toBe("head_of_team");
    expect(head?.plainPassword).toBe("local-head-password");

    expect(admin).toBeDefined();
    expect(admin?.role).toBe("admin");
    expect(admin?.plainPassword).toBe("local-admin-password");
  });

  it("assigns unique UUIDs and unique emails to each user", () => {
    const ids = new Set(DUMMY_USERS.map((u) => u.id));
    const emails = new Set(DUMMY_USERS.map((u) => u.email));

    expect(ids.size).toBe(DUMMY_USERS.length);
    expect(emails.size).toBe(DUMMY_USERS.length);
  });
});

describe("hashUserPassword", () => {
  it("generates a valid Argon2id hash that verifies correctly", async () => {
    const plain = "local-member-password";
    const hash = await hashUserPassword(plain);

    expect(hash.startsWith("$argon2id$")).toBe(true);
    const isValid = await Bun.password.verify(plain, hash);
    expect(isValid).toBe(true);

    const isWrong = await Bun.password.verify("wrong-password", hash);
    expect(isWrong).toBe(false);
  });
});

describe("generateLocalIdentityDirectory", () => {
  it("encodes seeded user records into base64 JSON payload for AUTH_LOCAL_IDENTITY_DIRECTORY", () => {
    const records: SeededUserRecord[] = [
      {
        id: "11111111-1111-4111-8111-111111111111",
        email: "member1@axentra.local",
        name: "Member Team 1",
        role: "member_team",
        passwordHash: "$argon2id$dummyhash",
      },
    ];

    const encoded = generateLocalIdentityDirectory(records);
    expect(typeof encoded).toBe("string");

    const decodedJson = Buffer.from(encoded, "base64").toString("utf8");
    const parsed = JSON.parse(decodedJson);

    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(1);
    expect(parsed[0]).toEqual({
      id: "11111111-1111-4111-8111-111111111111",
      email: "member1@axentra.local",
      name: "Member Team 1",
      role: "member_team",
      passwordHash: "$argon2id$dummyhash",
    });
  });
});

describe("seedUsers with mock client", () => {
  it("hashes passwords and invokes upsert for each definition", async () => {
    const insertedRows: unknown[] = [];

    const mockDb = {
      insert: () => ({
        values: (val: unknown) => ({
          onConflictDoUpdate: async () => {
            insertedRows.push(val);
          },
        }),
      }),
    };

    const mockClient = {
      db: mockDb,
      sql: {} as unknown,
    } as unknown as DatabaseClient;

    const results = await seedUsers(mockClient, [
      {
        id: "11111111-1111-4111-8111-111111111111",
        email: "member1@axentra.local",
        name: "Member Team 1",
        role: "member_team",
        plainPassword: "local-member-password",
      },
    ]);

    expect(results.length).toBe(1);
    expect(results[0]?.email).toBe("member1@axentra.local");
    expect(results[0]?.passwordHash.startsWith("$argon2id$")).toBe(true);
    expect(insertedRows.length).toBe(1);
  });
});
