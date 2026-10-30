import { sql } from "drizzle-orm";
import type { DatabaseClient } from "../client";
import { assertAllowedDatabaseClient, assertAllowedEnvironment } from "../env-guard";
import { userRoleEnum } from "../schema/enums";
import { users } from "../schema/users";

export type UserRole = (typeof userRoleEnum.enumValues)[number];

export type SeedUserRecord = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  passwordHash: string;
};

export type UserInsertValues = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  passwordHash: string;
  updatedAt: Date;
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Matches Zod's standard email format pattern to enforce parity with runtime authentication contract
const EMAIL_REGEX =
  /^(?:[A-Za-z0-9_'+-]+\.)*[A-Za-z0-9_'+-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isUserRole(role: string): role is UserRole {
  return (userRoleEnum.enumValues as readonly string[]).includes(role);
}

export function isValidUuid(id: string): boolean {
  return UUID_REGEX.test(id.trim());
}

export function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email);
}

export function validateSeedUserRecord(
  item: unknown,
  context: "directory" | "record" = "directory",
): SeedUserRecord {
  const prefix =
    context === "directory"
      ? "AUTH_LOCAL_IDENTITY_DIRECTORY contains records that do not match the required user identity contract"
      : "User record does not match the required user identity contract";

  if (!isRecord(item)) {
    throw new Error(`${prefix}: record must be an object`);
  }

  if (typeof item.id !== "string" || !isValidUuid(item.id)) {
    throw new Error(`${prefix}: id must be a valid UUID`);
  }

  if (typeof item.email !== "string" || !isValidEmail(item.email)) {
    throw new Error(`${prefix}: email must have a valid email format`);
  }

  if (typeof item.role !== "string" || !isUserRole(item.role)) {
    throw new Error(`${prefix}: role must be one of allowed user roles`);
  }

  if (typeof item.passwordHash !== "string" || item.passwordHash.trim().length === 0) {
    throw new Error(`${prefix}: passwordHash must not be empty or whitespace`);
  }

  const id = item.id.trim().toLowerCase();
  const email = item.email.toLowerCase();
  return {
    id,
    email,
    name: typeof item.name === "string" && item.name.trim().length > 0 ? item.name.trim() : email,
    role: item.role,
    passwordHash: item.passwordHash.trim(),
  };
}

export function parseLocalIdentityDirectory(encodedDirectory: string): SeedUserRecord[] {
  let raw: unknown;
  try {
    raw = JSON.parse(Buffer.from(encodedDirectory, "base64").toString("utf8"));
  } catch {
    throw new Error("AUTH_LOCAL_IDENTITY_DIRECTORY is not valid base64 JSON");
  }

  if (!Array.isArray(raw)) {
    throw new Error("AUTH_LOCAL_IDENTITY_DIRECTORY payload must be an array of user objects");
  }

  const records: SeedUserRecord[] = [];
  const seenEmails = new Set<string>();
  const seenIds = new Set<string>();

  for (const item of raw) {
    const validated = validateSeedUserRecord(item, "directory");
    if (seenIds.has(validated.id)) {
      throw new Error(`AUTH_LOCAL_IDENTITY_DIRECTORY contains duplicate id: ${validated.id}`);
    }
    if (seenEmails.has(validated.email)) {
      throw new Error(`AUTH_LOCAL_IDENTITY_DIRECTORY contains duplicate email: ${validated.email}`);
    }
    seenIds.add(validated.id);
    seenEmails.add(validated.email);
    records.push(validated);
  }

  return records;
}

export function resolveSeedUsers(encodedDirectory?: string): SeedUserRecord[] {
  if (encodedDirectory === undefined || encodedDirectory.trim().length === 0) {
    throw new Error(
      "AUTH_LOCAL_IDENTITY_DIRECTORY is required and cannot be empty. Silent fallback to hardcoded dummy credentials is not permitted.",
    );
  }

  const parsed = parseLocalIdentityDirectory(encodedDirectory);
  if (parsed.length === 0) {
    throw new Error("AUTH_LOCAL_IDENTITY_DIRECTORY contains no user records");
  }

  return parsed;
}

export async function seedUsers(
  client: DatabaseClient,
  records: readonly SeedUserRecord[],
): Promise<SeedUserRecord[]> {
  assertAllowedEnvironment(Bun.env.APP_ENV ?? process.env.APP_ENV);
  assertAllowedDatabaseClient(client);

  if (records.length === 0) {
    throw new Error("Cannot seed database with an empty list of user records");
  }

  // Pre-validate all records before performing any writes.
  // If any record is invalid (including the last element), the operation throws
  // immediately without writing any rows.
  const validatedRecords: SeedUserRecord[] = [];
  const seenEmails = new Set<string>();
  const seenIds = new Set<string>();

  for (const record of records) {
    const validated = validateSeedUserRecord(record, "record");
    if (seenIds.has(validated.id)) {
      throw new Error(`Cannot seed database: duplicate id found: ${validated.id}`);
    }
    if (seenEmails.has(validated.email)) {
      throw new Error(`Cannot seed database: duplicate email found: ${validated.email}`);
    }
    seenIds.add(validated.id);
    seenEmails.add(validated.email);
    validatedRecords.push(validated);
  }

  for (const record of validatedRecords) {
    await client.db
      .insert(users)
      .values({
        id: record.id,
        email: record.email,
        name: record.name,
        role: record.role,
        passwordHash: record.passwordHash,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: users.id,
        set: {
          email: sql`excluded.email`,
          name: sql`excluded.name`,
          role: sql`excluded.role`,
          passwordHash: sql`excluded.password_hash`,
          updatedAt: sql`now()`,
        },
      });
  }

  return [...validatedRecords];
}
