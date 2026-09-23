import { z } from "zod";
import { authUserSchema, type AuthUser, type LoginRequest, type UserRole } from "@axentra/shared";
import type { UserAuthenticator } from "./auth.service";

const localIdentityRecordSchema = authUserSchema.extend({
  passwordHash: z.string().min(1),
});

const localIdentityDirectorySchema = z.array(localIdentityRecordSchema).min(1);

export type LocalIdentityRecord = z.infer<typeof localIdentityRecordSchema>;

function decodeDirectory(encodedDirectory: string): unknown {
  try {
    return JSON.parse(Buffer.from(encodedDirectory, "base64").toString("utf8"));
  } catch {
    throw new Error("AUTH_LOCAL_IDENTITY_DIRECTORY is not valid base64 JSON");
  }
}

export function parseLocalIdentityDirectory(encodedDirectory: string): LocalIdentityRecord[] {
  const parsed = localIdentityDirectorySchema.safeParse(decodeDirectory(encodedDirectory));
  if (!parsed.success) {
    throw new Error("AUTH_LOCAL_IDENTITY_DIRECTORY does not match the identity contract");
  }

  const emails = new Set<string>();
  for (const record of parsed.data) {
    const email = record.email.toLowerCase();
    if (emails.has(email)) {
      throw new Error("AUTH_LOCAL_IDENTITY_DIRECTORY contains a duplicate email");
    }
    emails.add(email);
  }

  return parsed.data;
}

export function createLocalIdentityAuthenticator(encodedDirectory: string): UserAuthenticator {
  const directory = parseLocalIdentityDirectory(encodedDirectory);

  return async (credentials: LoginRequest): Promise<AuthUser | null> => {
    const email = credentials.email.toLowerCase();
    const record = directory.find((candidate) => candidate.email.toLowerCase() === email);
    if (record === undefined) return null;

    const passwordMatches = await Bun.password.verify(credentials.password, record.passwordHash);
    if (!passwordMatches) return null;

    const user: AuthUser = {
      id: record.id,
      email: record.email,
      role: record.role satisfies UserRole,
    };
    if (record.name !== undefined) {
      return { ...user, name: record.name };
    }
    return user;
  };
}
