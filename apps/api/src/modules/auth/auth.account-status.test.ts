import { describe, expect, test } from "bun:test";
import { createLogger } from "@axentra/observability";
import type { AccountStatus, AuthUser } from "@axentra/shared";
import { createPasswordVerifier } from "./auth.password";
import { createDatabaseAuthenticator } from "./runtime-authenticator";
import { createLocalIdentityAuthenticator } from "./local-identity";
import type { AuthCredentials, AuthUserRepository } from "./auth.types";

// Covers BE-S4-06 login effects: a deactivated account is rejected on the production path and on the
// development identity-directory path, with the same generic 401 result as a wrong password.
const logger = createLogger({
  service: "axentra-api",
  environment: "test",
  version: "0.1.0",
  level: "fatal",
});

const passwords = createPasswordVerifier({ logger });

const USER: AuthUser = {
  id: "00000000-0000-4000-8000-0000000000d1",
  email: "rina@axentra.local",
  role: "member_team",
  name: "Rina",
};

async function hashFor(password: string): Promise<string> {
  return Bun.password.hash(password, { algorithm: "argon2id" });
}

function repositoryWith(status: AccountStatus, passwordHash: string): AuthUserRepository {
  const credentials: AuthCredentials = { user: USER, passwordHash, status };
  return {
    async findCredentialsByEmail(email: string): Promise<AuthCredentials | null> {
      return email === USER.email ? credentials : null;
    },
    async findStatusById(userId: string): Promise<AccountStatus | null> {
      return userId === USER.id ? status : null;
    },
  };
}

describe("production login path (users table)", () => {
  test("accepts the correct password for an active account", async () => {
    const authenticator = createDatabaseAuthenticator(
      repositoryWith("active", await hashFor("correct-password")),
      passwords,
    );

    const result = await authenticator({ email: USER.email, password: "correct-password" });

    expect(result).toEqual(USER);
  });

  test("rejects the correct password for an inactive account, the same way a wrong password is rejected", async () => {
    const authenticator = createDatabaseAuthenticator(
      repositoryWith("inactive", await hashFor("correct-password")),
      passwords,
    );

    const correct = await authenticator({ email: USER.email, password: "correct-password" });
    const wrong = await authenticator({ email: USER.email, password: "wrong-password" });

    expect(correct).toBeNull();
    expect(wrong).toBeNull();
  });
});

describe("development identity-directory login path", () => {
  test("rejects a deactivated account when the users row is inactive", async () => {
    const hash = await hashFor("correct-password");
    const directory = encodeDirectory(USER, hash);
    const repository = repositoryWith("inactive", hash);
    const authenticator = createLocalIdentityAuthenticator(directory, passwords, (id) =>
      repository.findStatusById(id),
    );

    const result = await authenticator({ email: USER.email, password: "correct-password" });

    expect(result).toBeNull();
  });

  test("accepts an account whose users row is active", async () => {
    const hash = await hashFor("correct-password");
    const directory = encodeDirectory(USER, hash);
    const repository = repositoryWith("active", hash);
    const authenticator = createLocalIdentityAuthenticator(directory, passwords, (id) =>
      repository.findStatusById(id),
    );

    const result = await authenticator({ email: USER.email, password: "correct-password" });

    expect(result).toEqual(USER);
  });

  test("rejects an account with no users row, because sessions reference users rows", async () => {
    const hash = await hashFor("correct-password");
    const directory = encodeDirectory(USER, hash);
    const authenticator = createLocalIdentityAuthenticator(directory, passwords, async () => null);

    const result = await authenticator({ email: USER.email, password: "correct-password" });

    expect(result).toBeNull();
  });

  test("keeps the existing behavior when no status lookup is given", async () => {
    const hash = await hashFor("correct-password");
    const directory = encodeDirectory(USER, hash);
    const authenticator = createLocalIdentityAuthenticator(directory, passwords);

    const result = await authenticator({ email: USER.email, password: "correct-password" });

    expect(result).toEqual(USER);
  });
});

function encodeDirectory(user: AuthUser, passwordHash: string): string {
  const record = { id: user.id, email: user.email, role: user.role, name: user.name, passwordHash };
  return Buffer.from(JSON.stringify([record])).toString("base64");
}
