import { sql } from "drizzle-orm";
import type { DatabaseClient } from "../client";
import { users } from "../schema/users";
import type { userRoleEnum } from "../schema/enums";

export type UserRole = (typeof userRoleEnum.enumValues)[number];

export type SeedUserDefinition = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  plainPassword: string;
};

export type SeededUserRecord = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  passwordHash: string;
};

export const DUMMY_USERS: readonly SeedUserDefinition[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    email: "member1@axentra.local",
    name: "Member Team 1",
    role: "member_team",
    plainPassword: "local-member-password",
  },
  {
    id: "11111111-1111-4111-8111-222222222222",
    email: "member2@axentra.local",
    name: "Member Team 2",
    role: "member_team",
    plainPassword: "local-member-password",
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    email: "head@axentra.local",
    name: "Head of Team",
    role: "head_of_team",
    plainPassword: "local-head-password",
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    email: "admin@axentra.local",
    name: "Admin",
    role: "admin",
    plainPassword: "local-admin-password",
  },
] as const;

export async function hashUserPassword(plainPassword: string): Promise<string> {
  return await Bun.password.hash(plainPassword, { algorithm: "argon2id" });
}

export function generateLocalIdentityDirectory(records: readonly SeededUserRecord[]): string {
  const payload = records.map((record) => ({
    id: record.id,
    email: record.email,
    role: record.role,
    name: record.name,
    passwordHash: record.passwordHash,
  }));
  return Buffer.from(JSON.stringify(payload)).toString("base64");
}

export async function seedUsers(
  client: DatabaseClient,
  definitions: readonly SeedUserDefinition[] = DUMMY_USERS,
): Promise<SeededUserRecord[]> {
  const preparedUsers: SeededUserRecord[] = [];

  for (const def of definitions) {
    const passwordHash = await hashUserPassword(def.plainPassword);
    preparedUsers.push({
      id: def.id,
      email: def.email,
      name: def.name,
      role: def.role,
      passwordHash,
    });
  }

  for (const record of preparedUsers) {
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
        target: users.email,
        set: {
          name: sql`excluded.name`,
          role: sql`excluded.role`,
          passwordHash: sql`excluded.password_hash`,
          updatedAt: sql`now()`,
        },
      });
  }

  return preparedUsers;
}
