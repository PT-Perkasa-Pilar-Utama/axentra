import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { authUserSchema } from "@axentra/shared";
import * as dbPackage from "@axentra/db";
import {
  assertAllowedDatabaseUrl,
  assertAllowedEnvironment,
  createDatabaseClient,
  isValidEmail,
  parseLocalIdentityDirectory,
  resolveSeedUsers,
  runUserSeed,
  userRoleEnum,
  type DatabaseClient,
  type SeedUserRecord,
  type UserInsertValues,
} from "@axentra/db";
import { seedUsers } from "../src/seeds/users";

describe("assertAllowedEnvironment", () => {
  it("rejects production environment with an explicit security blocker", () => {
    expect(() => assertAllowedEnvironment("production")).toThrow(
      "Database seeder must not run in production environment",
    );
  });

  it("rejects non-development and non-test environments", () => {
    expect(() => assertAllowedEnvironment("staging")).toThrow(
      "Database seeder is restricted to development or test environments, got: staging",
    );
    expect(() => assertAllowedEnvironment(undefined)).toThrow(
      "Database seeder is restricted to development or test environments, got: undefined",
    );
  });

  it("allows development and test environments without error", () => {
    expect(() => assertAllowedEnvironment("development")).not.toThrow();
    expect(() => assertAllowedEnvironment("test")).not.toThrow();
  });
});

describe("assertAllowedDatabaseUrl", () => {
  it("rejects undefined or empty database URL", () => {
    expect(() => assertAllowedDatabaseUrl(undefined)).toThrow(
      "DATABASE_URL is required to run seed",
    );
    expect(() => assertAllowedDatabaseUrl("")).toThrow("DATABASE_URL is required to run seed");
    expect(() => assertAllowedDatabaseUrl("   ")).toThrow("DATABASE_URL is required to run seed");
  });

  it("rejects invalid URL strings", () => {
    expect(() => assertAllowedDatabaseUrl("not-a-valid-url")).toThrow(
      "Invalid database URL: failed to parse URL",
    );
  });

  it("rejects non-postgres protocols", () => {
    expect(() => assertAllowedDatabaseUrl("http://localhost:5432/axentra")).toThrow(
      "Invalid database URL: protocol must be postgres: or postgresql:",
    );
    expect(() => assertAllowedDatabaseUrl("mysql://localhost:3306/axentra")).toThrow(
      "Invalid database URL: protocol must be postgres: or postgresql:",
    );
  });

  it("rejects database URLs with host query parameter override", () => {
    expect(() =>
      assertAllowedDatabaseUrl("postgres://localhost:5432/axentra?host=prod.axentra.internal"),
    ).toThrow("Database seeder does not allow host query parameter");
  });

  it("rejects remote or production database hostnames", () => {
    expect(() =>
      assertAllowedDatabaseUrl("postgres://admin:secret@prod.axentra.internal:5432/axentra"),
    ).toThrow(
      "Database seeder is not allowed to run against remote/production database host: prod.axentra.internal",
    );
    expect(() =>
      assertAllowedDatabaseUrl("postgres://user:pass@db.production.company.com:5432/axentra"),
    ).toThrow(
      "Database seeder is not allowed to run against remote/production database host: db.production.company.com",
    );
    expect(() =>
      assertAllowedDatabaseUrl("postgres://user:pass@production-db.rds.amazonaws.com:5432/axentra"),
    ).toThrow(
      "Database seeder is not allowed to run against remote/production database host: production-db.rds.amazonaws.com",
    );
    expect(() =>
      assertAllowedDatabaseUrl("postgres://user:pass@[2001:db8::1]:5432/axentra"),
    ).toThrow(
      "Database seeder is not allowed to run against remote/production database host: 2001:db8::1",
    );
  });

  it("rejects remote or unowned .local database hostnames (no wildcard bypass)", () => {
    expect(() =>
      assertAllowedDatabaseUrl("postgres://admin:secret@prod-db.company.local:5432/axentra"),
    ).toThrow(
      "Database seeder is not allowed to run against remote/production database host: prod-db.company.local",
    );
    expect(() =>
      assertAllowedDatabaseUrl("postgres://admin:secret@db.axentra.local:5432/axentra"),
    ).toThrow(
      "Database seeder is not allowed to run against remote/production database host: db.axentra.local",
    );
  });

  it("rejects multi-host database URLs with remote host in first position", () => {
    expect(() =>
      assertAllowedDatabaseUrl("postgres://user:secret@prod-db.company.com,localhost:5432/axentra"),
    ).toThrow(
      "Database seeder is not allowed to run against remote/production database host: prod-db.company.com",
    );
  });

  it("rejects multi-host database URLs with remote host in last position", () => {
    expect(() =>
      assertAllowedDatabaseUrl("postgres://user:secret@localhost,prod-db.company.com:5432/axentra"),
    ).toThrow(
      "Database seeder is not allowed to run against remote/production database host: prod-db.company.com",
    );
  });

  it("rejects multi-host database URLs even when all hosts are local (seeder requires single instance)", () => {
    expect(() =>
      assertAllowedDatabaseUrl("postgres://user:secret@localhost,127.0.0.1:5432/axentra"),
    ).toThrow("Database seeder does not allow multi-host database URLs");
  });

  it("allows local and development database targets with various ports, userinfo, and aliases", () => {
    expect(() => assertAllowedDatabaseUrl("postgres://localhost:5432/axentra")).not.toThrow();
    expect(() => assertAllowedDatabaseUrl("postgres://localhost:5433/axentra")).not.toThrow();
    expect(() => assertAllowedDatabaseUrl("postgres://localhost/axentra")).not.toThrow();
    expect(() => assertAllowedDatabaseUrl("postgres://127.0.0.1:5432/axentra")).not.toThrow();
    expect(() => assertAllowedDatabaseUrl("postgres://[::1]:5432/axentra")).not.toThrow();
    expect(() => assertAllowedDatabaseUrl("postgres://user:pass@[::1]:5432/axentra")).not.toThrow();
    expect(() =>
      assertAllowedDatabaseUrl("postgres://host.docker.internal:5432/axentra"),
    ).not.toThrow();
    expect(() => assertAllowedDatabaseUrl("postgres://postgres:5432/axentra")).not.toThrow();
    expect(() =>
      assertAllowedDatabaseUrl("postgres://axentra:super-secret@localhost:5432/axentra"),
    ).not.toThrow();
    expect(() =>
      assertAllowedDatabaseUrl("postgresql://postgres:postgres@localhost:5432/axentra"),
    ).not.toThrow();
  });
});

describe("parseLocalIdentityDirectory", () => {
  it("decodes a valid base64 identity directory into SeedUserRecord items", () => {
    const payload = [
      {
        id: "11111111-1111-4111-8111-111111111111",
        email: "member@axentra.local",
        name: "Member Team",
        role: "member_team",
        passwordHash: "$argon2id$samplehash",
      },
    ];
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64");
    const records = parseLocalIdentityDirectory(encoded);

    expect(records.length).toBe(1);
    expect(records[0]?.id).toBe("11111111-1111-4111-8111-111111111111");
    expect(records[0]?.email).toBe("member@axentra.local");
    expect(records[0]?.role).toBe("member_team");
    expect(records[0]?.passwordHash).toBe("$argon2id$samplehash");
  });

  it("falls back to email when name is not provided or empty", () => {
    const payload = [
      {
        id: "11111111-1111-4111-8111-111111111111",
        email: "member@axentra.local",
        role: "member_team",
        passwordHash: "$argon2id$samplehash",
      },
    ];
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64");
    const records = parseLocalIdentityDirectory(encoded);

    expect(records[0]?.name).toBe("member@axentra.local");
  });

  it("throws on invalid base64 string", () => {
    expect(() => parseLocalIdentityDirectory("invalid-base64-%%%")).toThrow(
      "AUTH_LOCAL_IDENTITY_DIRECTORY is not valid base64 JSON",
    );
  });

  it("throws on non-array JSON payload", () => {
    const encoded = Buffer.from(JSON.stringify({ notAnArray: true })).toString("base64");
    expect(() => parseLocalIdentityDirectory(encoded)).toThrow(
      "AUTH_LOCAL_IDENTITY_DIRECTORY payload must be an array of user objects",
    );
  });

  it("throws when record has invalid UUID id", () => {
    const invalidId = Buffer.from(
      JSON.stringify([
        {
          id: "not-a-valid-uuid",
          email: "member@axentra.local",
          role: "member_team",
          passwordHash: "$argon2id$hash",
        },
      ]),
    ).toString("base64");
    expect(() => parseLocalIdentityDirectory(invalidId)).toThrow(
      "AUTH_LOCAL_IDENTITY_DIRECTORY contains records that do not match the required user identity contract: id must be a valid UUID",
    );
  });

  it("throws when record has invalid email format", () => {
    const invalidEmail = Buffer.from(
      JSON.stringify([
        {
          id: "11111111-1111-4111-8111-111111111111",
          email: "not-an-email-format",
          role: "member_team",
          passwordHash: "$argon2id$hash",
        },
      ]),
    ).toString("base64");
    expect(() => parseLocalIdentityDirectory(invalidEmail)).toThrow(
      "AUTH_LOCAL_IDENTITY_DIRECTORY contains records that do not match the required user identity contract: email must have a valid email format",
    );
  });

  it("throws when record has email with empty domain labels or consecutive dots (Zod parity)", () => {
    for (const invalidEmailFormat of [
      "member@axentra..local",
      "member@.axentra.local",
      "member@axentra.local.",
      "member..user@axentra.local",
    ]) {
      const invalidPayload = Buffer.from(
        JSON.stringify([
          {
            id: "11111111-1111-4111-8111-111111111111",
            email: invalidEmailFormat,
            role: "member_team",
            passwordHash: "$argon2id$hash",
          },
        ]),
      ).toString("base64");
      expect(() => parseLocalIdentityDirectory(invalidPayload)).toThrow(
        "AUTH_LOCAL_IDENTITY_DIRECTORY contains records that do not match the required user identity contract: email must have a valid email format",
      );
    }
  });

  it("rejects leading, trailing, and surrounding whitespace in email matching Zod auth contract parity", () => {
    const whitespaceEmails = [
      " member@axentra.local",
      "member@axentra.local ",
      " member@axentra.local ",
      "\tmember@axentra.local",
      "member@axentra.local\n",
    ];

    for (const email of whitespaceEmails) {
      // Runtime authentication contract (Zod) rejects raw string with whitespace
      const zodParsed = authUserSchema.shape.email.safeParse(email);
      expect(zodParsed.success).toBe(false);

      // Seeder validation rejects raw string with whitespace identically
      expect(isValidEmail(email)).toBe(false);

      const payload = Buffer.from(
        JSON.stringify([
          {
            id: "11111111-1111-4111-8111-111111111111",
            email,
            role: "member_team",
            passwordHash: "$argon2id$hash",
          },
        ]),
      ).toString("base64");

      expect(() => parseLocalIdentityDirectory(payload)).toThrow(
        "AUTH_LOCAL_IDENTITY_DIRECTORY contains records that do not match the required user identity contract: email must have a valid email format",
      );
    }

    // Verify valid trimmed email is accepted identically by both
    const cleanEmail = "member@axentra.local";
    expect(authUserSchema.shape.email.safeParse(cleanEmail).success).toBe(true);
    expect(isValidEmail(cleanEmail)).toBe(true);
  });

  it("throws when record is missing role or has an invalid role", () => {
    const missingRole = Buffer.from(
      JSON.stringify([
        {
          id: "11111111-1111-4111-8111-111111111111",
          email: "member@axentra.local",
          passwordHash: "$argon2id$hash",
        },
      ]),
    ).toString("base64");
    expect(() => parseLocalIdentityDirectory(missingRole)).toThrow(
      "AUTH_LOCAL_IDENTITY_DIRECTORY contains records that do not match the required user identity contract: role must be one of allowed user roles",
    );

    const invalidRole = Buffer.from(
      JSON.stringify([
        {
          id: "11111111-1111-4111-8111-111111111111",
          email: "member@axentra.local",
          role: "super_superuser",
          passwordHash: "$argon2id$hash",
        },
      ]),
    ).toString("base64");
    expect(() => parseLocalIdentityDirectory(invalidRole)).toThrow(
      "AUTH_LOCAL_IDENTITY_DIRECTORY contains records that do not match the required user identity contract: role must be one of allowed user roles",
    );
  });

  it("throws when record has empty or whitespace-only passwordHash", () => {
    const emptyHash = Buffer.from(
      JSON.stringify([
        {
          id: "11111111-1111-4111-8111-111111111111",
          email: "member@axentra.local",
          role: "member_team",
          passwordHash: "",
        },
      ]),
    ).toString("base64");
    expect(() => parseLocalIdentityDirectory(emptyHash)).toThrow(
      "AUTH_LOCAL_IDENTITY_DIRECTORY contains records that do not match the required user identity contract: passwordHash must not be empty or whitespace",
    );

    const whitespaceHash = Buffer.from(
      JSON.stringify([
        {
          id: "11111111-1111-4111-8111-111111111111",
          email: "member@axentra.local",
          role: "member_team",
          passwordHash: "   ",
        },
      ]),
    ).toString("base64");
    expect(() => parseLocalIdentityDirectory(whitespaceHash)).toThrow(
      "AUTH_LOCAL_IDENTITY_DIRECTORY contains records that do not match the required user identity contract: passwordHash must not be empty or whitespace",
    );
  });

  it("throws when identity directory contains duplicate emails", () => {
    const duplicates = Buffer.from(
      JSON.stringify([
        {
          id: "11111111-1111-4111-8111-111111111111",
          email: "member@axentra.local",
          role: "member_team",
          passwordHash: "$argon2id$hash1",
        },
        {
          id: "11111111-1111-4111-8111-222222222222",
          email: "MEMBER@axentra.local",
          role: "member_team",
          passwordHash: "$argon2id$hash2",
        },
      ]),
    ).toString("base64");

    expect(() => parseLocalIdentityDirectory(duplicates)).toThrow(
      "AUTH_LOCAL_IDENTITY_DIRECTORY contains duplicate email: member@axentra.local",
    );
  });

  it("throws when identity directory contains duplicate ids", () => {
    const duplicateIds = Buffer.from(
      JSON.stringify([
        {
          id: "11111111-1111-4111-8111-111111111111",
          email: "member1@axentra.local",
          role: "member_team",
          passwordHash: "$argon2id$hash1",
        },
        {
          id: "11111111-1111-4111-8111-111111111111",
          email: "member2@axentra.local",
          role: "member_team",
          passwordHash: "$argon2id$hash2",
        },
      ]),
    ).toString("base64");

    expect(() => parseLocalIdentityDirectory(duplicateIds)).toThrow(
      "AUTH_LOCAL_IDENTITY_DIRECTORY contains duplicate id: 11111111-1111-4111-8111-111111111111",
    );
  });

  it("throws when identity directory contains duplicate ids with different casing", () => {
    const duplicateCasedIds = Buffer.from(
      JSON.stringify([
        {
          id: "A0EEBC99-9C0B-4EF8-BB6D-6BB9BD380A11",
          email: "member1@axentra.local",
          role: "member_team",
          passwordHash: "$argon2id$hash1",
        },
        {
          id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
          email: "member2@axentra.local",
          role: "member_team",
          passwordHash: "$argon2id$hash2",
        },
      ]),
    ).toString("base64");

    expect(() => parseLocalIdentityDirectory(duplicateCasedIds)).toThrow(
      "AUTH_LOCAL_IDENTITY_DIRECTORY contains duplicate id: a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
    );
  });
});

describe("resolveSeedUsers", () => {
  it("throws when directory is undefined or empty string, refusing silent fallback", () => {
    expect(() => resolveSeedUsers(undefined)).toThrow(
      "AUTH_LOCAL_IDENTITY_DIRECTORY is required and cannot be empty. Silent fallback to hardcoded dummy credentials is not permitted.",
    );
    expect(() => resolveSeedUsers("")).toThrow(
      "AUTH_LOCAL_IDENTITY_DIRECTORY is required and cannot be empty. Silent fallback to hardcoded dummy credentials is not permitted.",
    );
    expect(() => resolveSeedUsers("   ")).toThrow(
      "AUTH_LOCAL_IDENTITY_DIRECTORY is required and cannot be empty. Silent fallback to hardcoded dummy credentials is not permitted.",
    );
  });

  it("throws when directory decodes to an empty array", () => {
    const emptyArrayEncoded = Buffer.from(JSON.stringify([])).toString("base64");
    expect(() => resolveSeedUsers(emptyArrayEncoded)).toThrow(
      "AUTH_LOCAL_IDENTITY_DIRECTORY contains no user records",
    );
  });

  it("resolves valid directory records with 2 member_team, 1 head_of_team, and 1 admin", () => {
    const payload: SeedUserRecord[] = [
      {
        id: "11111111-1111-4111-8111-111111111111",
        email: "member@axentra.local",
        name: "Member Team",
        role: "member_team",
        passwordHash: "$argon2id$memberhash",
      },
      {
        id: "11111111-1111-4111-8111-222222222222",
        email: "member2@axentra.local",
        name: "Member Team 2",
        role: "member_team",
        passwordHash: "$argon2id$member2hash",
      },
      {
        id: "22222222-2222-4222-8222-222222222222",
        email: "head@axentra.local",
        name: "Head of Team",
        role: "head_of_team",
        passwordHash: "$argon2id$headhash",
      },
      {
        id: "33333333-3333-4333-8333-333333333333",
        email: "admin@axentra.local",
        name: "Admin",
        role: "admin",
        passwordHash: "$argon2id$adminhash",
      },
    ];

    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64");
    const resolved = resolveSeedUsers(encoded);

    expect(resolved.length).toBe(4);
    expect(resolved.filter((u) => u.role === "member_team").length).toBe(2);
    expect(resolved.filter((u) => u.role === "head_of_team").length).toBe(1);
    expect(resolved.filter((u) => u.role === "admin").length).toBe(1);

    for (const user of resolved) {
      expect(userRoleEnum.enumValues).toContain(user.role);
      expect(user.passwordHash.startsWith("$argon2id$")).toBe(true);
      expect("plainPassword" in user).toBe(false);
    }
  });
});

type UserSeedDatabase = {
  insert: (table: unknown) => {
    values: (value: UserInsertValues) => {
      onConflictDoUpdate: (config: {
        target: unknown;
        set: Record<string, unknown>;
      }) => Promise<unknown>;
    };
  };
};

function createMockSeedClient(mockDb: UserSeedDatabase): DatabaseClient {
  const client = createDatabaseClient("postgres://user:secret@localhost:5432/axentra");
  Object.defineProperty(client.db, "insert", {
    configurable: true,
    value: mockDb.insert,
  });
  return client;
}

describe("seedUsers with narrow mock client", () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = Bun.env.APP_ENV;
    Bun.env.APP_ENV = "test";
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      Bun.env.APP_ENV = originalEnv;
    } else {
      delete Bun.env.APP_ENV;
    }
  });

  it("rejects seeding when APP_ENV is production, preventing write bypass", async () => {
    Bun.env.APP_ENV = "production";
    const mockDb: UserSeedDatabase = {
      insert: () => ({
        values: () => ({
          onConflictDoUpdate: async () => Promise.resolve(),
        }),
      }),
    };
    const mockClient = createMockSeedClient(mockDb);
    await expect(
      seedUsers(mockClient, [
        {
          id: "11111111-1111-4111-8111-111111111111",
          email: "member@axentra.local",
          name: "Member Team",
          role: "member_team",
          passwordHash: "$argon2id$hash",
        },
      ]),
    ).rejects.toThrow("Database seeder must not run in production environment");
  });

  it("throws when attempting to seed with an empty records array", async () => {
    const mockDb: UserSeedDatabase = {
      insert: () => ({
        values: () => ({
          onConflictDoUpdate: async () => Promise.resolve(),
        }),
      }),
    };
    const mockClient = createMockSeedClient(mockDb);

    expect(seedUsers(mockClient, [])).rejects.toThrow(
      "Cannot seed database with an empty list of user records",
    );
  });

  it("aborts completely without writing earlier records when invalid record is at the end of the list", async () => {
    const insertedRows: UserInsertValues[] = [];
    const mockDb: UserSeedDatabase = {
      insert: (_table) => ({
        values: (val: UserInsertValues) => ({
          onConflictDoUpdate: async (_config) => {
            insertedRows.push(val);
            return Promise.resolve();
          },
        }),
      }),
    };
    const mockClient = createMockSeedClient(mockDb);

    const recordsWithInvalidLast = [
      {
        id: "11111111-1111-4111-8111-111111111111",
        email: "valid1@axentra.local",
        name: "Valid User 1",
        role: "member_team" as const,
        passwordHash: "$argon2id$hash1",
      },
      {
        id: "11111111-1111-4111-8111-222222222222",
        email: "valid2@axentra.local",
        name: "Valid User 2",
        role: "member_team" as const,
        passwordHash: "$argon2id$hash2",
      },
      {
        id: "not-a-valid-uuid",
        email: "invalid@axentra.local",
        name: "Invalid User",
        role: "member_team" as const,
        passwordHash: "$argon2id$hash3",
      },
    ];

    await expect(seedUsers(mockClient, recordsWithInvalidLast)).rejects.toThrow(
      "User record does not match the required user identity contract: id must be a valid UUID",
    );

    // Verifies that neither record 1 nor record 2 were written
    expect(insertedRows.length).toBe(0);
  });

  it("rejects seeding when record has invalid email, without writing any rows", async () => {
    const insertedRows: UserInsertValues[] = [];
    const mockDb: UserSeedDatabase = {
      insert: (_table) => ({
        values: (val: UserInsertValues) => ({
          onConflictDoUpdate: async (_config) => {
            insertedRows.push(val);
            return Promise.resolve();
          },
        }),
      }),
    };
    const mockClient = createMockSeedClient(mockDb);

    await expect(
      seedUsers(mockClient, [
        {
          id: "11111111-1111-4111-8111-111111111111",
          email: "invalid-email-format",
          name: "User",
          role: "member_team",
          passwordHash: "$argon2id$hash",
        },
      ]),
    ).rejects.toThrow("email must have a valid email format");
    expect(insertedRows.length).toBe(0);
  });

  it("rejects seeding when email contains consecutive dots (e.g. member@axentra..local), without writing any rows", async () => {
    const insertedRows: UserInsertValues[] = [];
    const mockDb: UserSeedDatabase = {
      insert: (_table) => ({
        values: (val: UserInsertValues) => ({
          onConflictDoUpdate: async (_config) => {
            insertedRows.push(val);
            return Promise.resolve();
          },
        }),
      }),
    };
    const mockClient = createMockSeedClient(mockDb);

    await expect(
      seedUsers(mockClient, [
        {
          id: "11111111-1111-4111-8111-111111111111",
          email: "member@axentra..local",
          name: "Member",
          role: "member_team",
          passwordHash: "$argon2id$hash",
        },
      ]),
    ).rejects.toThrow("email must have a valid email format");
    expect(insertedRows.length).toBe(0);
  });

  it("rejects seeding when records contain duplicate ids, without writing any rows", async () => {
    const insertedRows: UserInsertValues[] = [];
    const mockDb: UserSeedDatabase = {
      insert: (_table) => ({
        values: (val: UserInsertValues) => ({
          onConflictDoUpdate: async (_config) => {
            insertedRows.push(val);
            return Promise.resolve();
          },
        }),
      }),
    };
    const mockClient = createMockSeedClient(mockDb);

    await expect(
      seedUsers(mockClient, [
        {
          id: "11111111-1111-4111-8111-111111111111",
          email: "user1@axentra.local",
          name: "User 1",
          role: "member_team",
          passwordHash: "$argon2id$hash",
        },
        {
          id: "11111111-1111-4111-8111-111111111111",
          email: "user2@axentra.local",
          name: "User 2",
          role: "member_team",
          passwordHash: "$argon2id$hash",
        },
      ]),
    ).rejects.toThrow(
      "Cannot seed database: duplicate id found: 11111111-1111-4111-8111-111111111111",
    );
    expect(insertedRows.length).toBe(0);
  });

  it("rejects seeding when records contain duplicate ids with different casing, without writing any rows", async () => {
    const insertedRows: UserInsertValues[] = [];
    const mockDb: UserSeedDatabase = {
      insert: (_table) => ({
        values: (val: UserInsertValues) => ({
          onConflictDoUpdate: async (_config) => {
            insertedRows.push(val);
            return Promise.resolve();
          },
        }),
      }),
    };
    const mockClient = createMockSeedClient(mockDb);

    await expect(
      seedUsers(mockClient, [
        {
          id: "A0EEBC99-9C0B-4EF8-BB6D-6BB9BD380A11",
          email: "user1@axentra.local",
          name: "User 1",
          role: "member_team",
          passwordHash: "$argon2id$hash",
        },
        {
          id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
          email: "user2@axentra.local",
          name: "User 2",
          role: "member_team",
          passwordHash: "$argon2id$hash",
        },
      ]),
    ).rejects.toThrow(
      "Cannot seed database: duplicate id found: a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
    );
    expect(insertedRows.length).toBe(0);
  });

  it("rejects seeding when email contains leading or trailing whitespace, without writing any rows", async () => {
    const insertedRows: UserInsertValues[] = [];
    const mockDb: UserSeedDatabase = {
      insert: (_table) => ({
        values: (val: UserInsertValues) => ({
          onConflictDoUpdate: async (_config) => {
            insertedRows.push(val);
            return Promise.resolve();
          },
        }),
      }),
    };
    const mockClient = createMockSeedClient(mockDb);

    await expect(
      seedUsers(mockClient, [
        {
          id: "11111111-1111-4111-8111-111111111111",
          email: " member@axentra.local ",
          name: "Member",
          role: "member_team",
          passwordHash: "$argon2id$hash",
        },
      ]),
    ).rejects.toThrow("email must have a valid email format");
    expect(insertedRows.length).toBe(0);
  });

  it("aborts completely without writing earlier records when invalid email is on the last record", async () => {
    const insertedRows: UserInsertValues[] = [];
    const mockDb: UserSeedDatabase = {
      insert: (_table) => ({
        values: (val: UserInsertValues) => ({
          onConflictDoUpdate: async (_config) => {
            insertedRows.push(val);
            return Promise.resolve();
          },
        }),
      }),
    };
    const mockClient = createMockSeedClient(mockDb);

    const recordsWithInvalidEmailLast = [
      {
        id: "11111111-1111-4111-8111-111111111111",
        email: "valid1@axentra.local",
        name: "Valid User 1",
        role: "member_team" as const,
        passwordHash: "$argon2id$hash1",
      },
      {
        id: "11111111-1111-4111-8111-222222222222",
        email: "valid2@axentra.local",
        name: "Valid User 2",
        role: "member_team" as const,
        passwordHash: "$argon2id$hash2",
      },
      {
        id: "33333333-3333-4333-8333-333333333333",
        email: "member@axentra..local",
        name: "Invalid Email Last",
        role: "member_team" as const,
        passwordHash: "$argon2id$hash3",
      },
    ];

    await expect(seedUsers(mockClient, recordsWithInvalidEmailLast)).rejects.toThrow(
      "User record does not match the required user identity contract: email must have a valid email format",
    );

    // Pre-validation guarantees that neither record 1 nor record 2 were written
    expect(insertedRows.length).toBe(0);
  });

  it("rejects seeding when record has empty or whitespace passwordHash, without writing any rows", async () => {
    const insertedRows: UserInsertValues[] = [];
    const mockDb: UserSeedDatabase = {
      insert: (_table) => ({
        values: (val: UserInsertValues) => ({
          onConflictDoUpdate: async (_config) => {
            insertedRows.push(val);
            return Promise.resolve();
          },
        }),
      }),
    };
    const mockClient = createMockSeedClient(mockDb);

    await expect(
      seedUsers(mockClient, [
        {
          id: "11111111-1111-4111-8111-111111111111",
          email: "user@axentra.local",
          name: "User",
          role: "member_team",
          passwordHash: "   ",
        },
      ]),
    ).rejects.toThrow("passwordHash must not be empty or whitespace");
    expect(insertedRows.length).toBe(0);
  });

  it("invokes upsert for each record on the narrow insert surface without unsafe casts", async () => {
    const insertedRows: UserInsertValues[] = [];

    const mockDb: UserSeedDatabase = {
      insert: (_table) => ({
        values: (val: UserInsertValues) => ({
          onConflictDoUpdate: async (_config) => {
            insertedRows.push(val);
            return Promise.resolve();
          },
        }),
      }),
    };

    const mockClient = createMockSeedClient(mockDb);

    const results = await seedUsers(mockClient, [
      {
        id: "11111111-1111-4111-8111-111111111111",
        email: "member@axentra.local",
        name: "Member Team",
        role: "member_team",
        passwordHash: "$argon2id$dummyhash",
      },
    ]);

    expect(results.length).toBe(1);
    expect(results[0]?.email).toBe("member@axentra.local");
    expect(results[0]?.passwordHash).toBe("$argon2id$dummyhash");
    expect(insertedRows.length).toBe(1);
    expect(insertedRows[0]?.email).toBe("member@axentra.local");
  });
});

describe("runUserSeed entry point", () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = Bun.env.APP_ENV;
    Bun.env.APP_ENV = "test";
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      Bun.env.APP_ENV = originalEnv;
    } else {
      delete Bun.env.APP_ENV;
    }
  });

  it("rejects execution when APP_ENV is production", async () => {
    Bun.env.APP_ENV = "production";
    await expect(runUserSeed()).rejects.toThrow(
      "Database seeder must not run in production environment",
    );
  });

  it("rejects execution when DATABASE_URL is missing", async () => {
    const originalEnv = Bun.env.APP_ENV;
    const originalDbUrl = Bun.env.DATABASE_URL;
    try {
      Bun.env.APP_ENV = "test";
      delete Bun.env.DATABASE_URL;
      await expect(runUserSeed()).rejects.toThrow("DATABASE_URL is required to run seed");
    } finally {
      Bun.env.APP_ENV = originalEnv;
      if (originalDbUrl !== undefined) {
        Bun.env.DATABASE_URL = originalDbUrl;
      }
    }
  });

  it("rejects execution when AUTH_LOCAL_IDENTITY_DIRECTORY is missing", async () => {
    const originalEnv = Bun.env.APP_ENV;
    const originalDbUrl = Bun.env.DATABASE_URL;
    const originalAuth = Bun.env.AUTH_LOCAL_IDENTITY_DIRECTORY;
    try {
      Bun.env.APP_ENV = "test";
      Bun.env.DATABASE_URL = "postgres://test:test@localhost:5432/test";
      delete Bun.env.AUTH_LOCAL_IDENTITY_DIRECTORY;
      await expect(runUserSeed()).rejects.toThrow(
        "AUTH_LOCAL_IDENTITY_DIRECTORY is required to run seed. Silent fallback to hardcoded dummy credentials is not permitted.",
      );
    } finally {
      Bun.env.APP_ENV = originalEnv;
      if (originalDbUrl !== undefined) {
        Bun.env.DATABASE_URL = originalDbUrl;
      }
      if (originalAuth !== undefined) {
        Bun.env.AUTH_LOCAL_IDENTITY_DIRECTORY = originalAuth;
      }
    }
  });

  it("rejects execution when DATABASE_URL points to a production or remote host even in development/test", async () => {
    const originalEnv = Bun.env.APP_ENV;
    const originalDbUrl = Bun.env.DATABASE_URL;
    const originalAuth = Bun.env.AUTH_LOCAL_IDENTITY_DIRECTORY;
    try {
      Bun.env.APP_ENV = "development";
      Bun.env.DATABASE_URL = "postgres://admin:secret@prod.axentra.internal:5432/axentra";
      Bun.env.AUTH_LOCAL_IDENTITY_DIRECTORY = Buffer.from(
        JSON.stringify([
          {
            id: "11111111-1111-4111-8111-111111111111",
            email: "member@axentra.local",
            name: "Member Team",
            role: "member_team",
            passwordHash: "$argon2id$hash",
          },
        ]),
      ).toString("base64");

      await expect(runUserSeed()).rejects.toThrow(
        "Database seeder is not allowed to run against remote/production database host: prod.axentra.internal",
      );
    } finally {
      Bun.env.APP_ENV = originalEnv;
      if (originalDbUrl !== undefined) {
        Bun.env.DATABASE_URL = originalDbUrl;
      } else {
        delete Bun.env.DATABASE_URL;
      }
      if (originalAuth !== undefined) {
        Bun.env.AUTH_LOCAL_IDENTITY_DIRECTORY = originalAuth;
      } else {
        delete Bun.env.AUTH_LOCAL_IDENTITY_DIRECTORY;
      }
    }
  });

  it("rejects execution when DATABASE_URL is multi-host or remote in development and test environments", async () => {
    const originalEnv = Bun.env.APP_ENV;
    const originalDbUrl = Bun.env.DATABASE_URL;
    const originalAuth = Bun.env.AUTH_LOCAL_IDENTITY_DIRECTORY;
    try {
      Bun.env.AUTH_LOCAL_IDENTITY_DIRECTORY = Buffer.from(
        JSON.stringify([
          {
            id: "11111111-1111-4111-8111-111111111111",
            email: "member@axentra.local",
            name: "Member Team",
            role: "member_team",
            passwordHash: "$argon2id$hash",
          },
        ]),
      ).toString("base64");

      // Test multi-host with remote first in development
      Bun.env.APP_ENV = "development";
      Bun.env.DATABASE_URL = "postgres://user:secret@prod-db.company.com,localhost:5432/axentra";
      await expect(runUserSeed()).rejects.toThrow(
        "Database seeder is not allowed to run against remote/production database host: prod-db.company.com",
      );

      // Test multi-host with remote last in test
      Bun.env.APP_ENV = "test";
      Bun.env.DATABASE_URL = "postgres://user:secret@localhost,prod-db.company.com:5432/axentra";
      await expect(runUserSeed()).rejects.toThrow(
        "Database seeder is not allowed to run against remote/production database host: prod-db.company.com",
      );

      // Test .local remote domain in development
      Bun.env.APP_ENV = "development";
      Bun.env.DATABASE_URL = "postgres://user:secret@prod-db.company.local:5432/axentra";
      await expect(runUserSeed()).rejects.toThrow(
        "Database seeder is not allowed to run against remote/production database host: prod-db.company.local",
      );
    } finally {
      Bun.env.APP_ENV = originalEnv;
      if (originalDbUrl !== undefined) {
        Bun.env.DATABASE_URL = originalDbUrl;
      } else {
        delete Bun.env.DATABASE_URL;
      }
      if (originalAuth !== undefined) {
        Bun.env.AUTH_LOCAL_IDENTITY_DIRECTORY = originalAuth;
      } else {
        delete Bun.env.AUTH_LOCAL_IDENTITY_DIRECTORY;
      }
    }
  });
});

describe("seed writer entry point restriction (F9 blocker)", () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = Bun.env.APP_ENV;
    Bun.env.APP_ENV = "test";
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      Bun.env.APP_ENV = originalEnv;
    } else {
      delete Bun.env.APP_ENV;
    }
  });

  it("proves seedUsers is NOT exported from the public package entry point @axentra/db", () => {
    expect("seedUsers" in dbPackage).toBe(false);
    expect((dbPackage as Record<string, unknown>).seedUsers).toBeUndefined();
  });

  it("proves seedUsers rejects execution when DatabaseClient connects to a remote database host", async () => {
    const client = createDatabaseClient("postgres://admin:secret@prod-db.company.com:5432/axentra");
    try {
      await expect(
        seedUsers(client, [
          {
            id: "11111111-1111-4111-8111-111111111111",
            email: "member@axentra.local",
            name: "Member Team",
            role: "member_team",
            passwordHash: "$argon2id$hash",
          },
        ]),
      ).rejects.toThrow(
        "Database seeder is not allowed to run against remote/production database host: prod-db.company.com",
      );
    } finally {
      await client.sql.end({ timeout: 1 });
    }
  });

  it("rejects forged localhost metadata paired with a remote writer without writing", async () => {
    let writeAttempted = false;
    const client = createDatabaseClient("postgres://admin:secret@prod-db.company.com:5432/axentra");
    const spoofedSql = Object.assign(() => {}, { options: { host: ["localhost"] } });
    const database = client.db as unknown as {
      insert: () => unknown;
      session: { client: unknown };
    };
    database.session.client = spoofedSql;
    Object.defineProperty(client.db, "insert", {
      configurable: true,
      value: () => {
        writeAttempted = true;
        throw new Error("Remote write must not be attempted");
      },
    });

    try {
      await expect(
        seedUsers({ db: client.db, sql: spoofedSql } as unknown as DatabaseClient, [
          {
            id: "11111111-1111-4111-8111-111111111111",
            email: "member@axentra.local",
            name: "Member Team",
            role: "member_team",
            passwordHash: "$argon2id$hash",
          },
        ]),
      ).rejects.toThrow(
        "Database seeder rejects execution with db-only or unverified client: client must have verified host connection",
      );
      expect(writeAttempted).toBe(false);
    } finally {
      await client.sql.end({ timeout: 1 });
    }
  });

  it("keeps the configured host immutable after a DatabaseClient is created", async () => {
    const client = createDatabaseClient("postgres://user:secret@localhost:5432/axentra");
    try {
      expect(() =>
        Object.defineProperty(client.sql.options, "host", {
          configurable: true,
          value: ["prod-db.company.com"],
        }),
      ).toThrow();
      expect(() =>
        Object.defineProperty(client.sql, "options", {
          configurable: true,
          value: { host: ["prod-db.company.com"] },
        }),
      ).toThrow();
    } finally {
      await client.sql.end({ timeout: 1 });
    }
  });

  it("proves seedUsers rejects execution when DatabaseClient connects to multi-host database URLs", async () => {
    const client = createDatabaseClient(
      "postgres://user:secret@localhost:5432,127.0.0.1:5433/axentra",
    );
    try {
      await expect(
        seedUsers(client, [
          {
            id: "11111111-1111-4111-8111-111111111111",
            email: "member@axentra.local",
            name: "Member Team",
            role: "member_team",
            passwordHash: "$argon2id$hash",
          },
        ]),
      ).rejects.toThrow("Database seeder does not allow multi-host database URLs");
    } finally {
      await client.sql.end({ timeout: 1 });
    }
  });

  it("proves seedUsers rejects execution when called with a db-only client lacking host verification, without performing writes", async () => {
    let writeAttempted = false;
    const dbOnlyClient = {
      db: {
        insert: () => {
          writeAttempted = true;
          return {
            values: () => ({
              onConflictDoUpdate: async () => Promise.resolve(),
            }),
          };
        },
      },
    };

    await expect(
      seedUsers(dbOnlyClient as unknown as DatabaseClient, [
        {
          id: "11111111-1111-4111-8111-111111111111",
          email: "member@axentra.local",
          name: "Member Team",
          role: "member_team",
          passwordHash: "$argon2id$hash",
        },
      ]),
    ).rejects.toThrow(
      "Database seeder rejects execution with db-only or unverified client: client must have verified host connection",
    );

    expect(writeAttempted).toBe(false);
  });

  it("proves seedUsers rejects execution when client is missing sql connection object", async () => {
    const invalidClient = { db: {} };
    await expect(
      seedUsers(invalidClient as unknown as DatabaseClient, [
        {
          id: "11111111-1111-4111-8111-111111111111",
          email: "member@axentra.local",
          name: "Member Team",
          role: "member_team",
          passwordHash: "$argon2id$hash",
        },
      ]),
    ).rejects.toThrow(
      "Database seeder rejects execution with db-only or unverified client: client must have verified host connection",
    );
  });

  it("proves seedUsers rejects execution when client host information is missing", async () => {
    const noHostClient = {
      db: {},
      sql: Object.assign(() => {}, { options: {} }),
    };
    await expect(
      seedUsers(noHostClient as unknown as DatabaseClient, [
        {
          id: "11111111-1111-4111-8111-111111111111",
          email: "member@axentra.local",
          name: "Member Team",
          role: "member_team",
          passwordHash: "$argon2id$hash",
        },
      ]),
    ).rejects.toThrow(
      "Database seeder rejects execution: database client host information is missing",
    );
  });

  it("proves seedUsers rejects execution when db session connection does not match verified sql connection", async () => {
    const mismatchedClient = {
      db: {
        session: {
          client: () => {},
        },
      },
      sql: Object.assign(() => {}, { options: { host: "localhost" } }),
    };
    await expect(
      seedUsers(mismatchedClient as unknown as DatabaseClient, [
        {
          id: "11111111-1111-4111-8111-111111111111",
          email: "member@axentra.local",
          name: "Member Team",
          role: "member_team",
          passwordHash: "$argon2id$hash",
        },
      ]),
    ).rejects.toThrow("Database seeder rejects execution: database client connection mismatch");
  });

  it("proves seedUsers rejects execution when client db instance is missing", async () => {
    const noDbClient = {
      sql: Object.assign(() => {}, { options: { host: "localhost" } }),
    };
    await expect(
      seedUsers(noDbClient as unknown as DatabaseClient, [
        {
          id: "11111111-1111-4111-8111-111111111111",
          email: "member@axentra.local",
          name: "Member Team",
          role: "member_team",
          passwordHash: "$argon2id$hash",
        },
      ]),
    ).rejects.toThrow(
      "Database seeder rejects execution with invalid client: client must have a db instance",
    );
  });

  it("proves seedUsers rejects execution when db session connection is missing", async () => {
    const noSessionClient = {
      db: {},
      sql: Object.assign(() => {}, { options: { host: "localhost" } }),
    };
    await expect(
      seedUsers(noSessionClient as unknown as DatabaseClient, [
        {
          id: "11111111-1111-4111-8111-111111111111",
          email: "member@axentra.local",
          name: "Member Team",
          role: "member_team",
          passwordHash: "$argon2id$hash",
        },
      ]),
    ).rejects.toThrow("Database seeder rejects execution: database client connection mismatch");
  });
});
