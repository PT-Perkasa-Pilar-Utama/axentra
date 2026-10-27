import { describe, expect, it } from "bun:test";
import type { AuthUser } from "@axentra/shared";
import type { AuthCredentials, AuthUserRepository } from "./auth.types";
import { createAuthService } from "./auth.service";
import { InMemoryAuthSessionStore, InMemoryLoginAttemptStore } from "./auth.memory-stores";
import { createDatabaseAuthenticator, createRuntimeAuthenticator } from "./runtime-authenticator";
import { encodeDirectory, runtimeConfig, TEST_MEMBER } from "./auth.test-support";

const PRODUCTION_USER: AuthUser = { ...TEST_MEMBER, role: "head_of_team" };

type RepositoryStub = AuthUserRepository & { readonly lookups: string[] };

function repositoryFor(records: ReadonlyArray<[string, AuthCredentials]>): RepositoryStub {
  const byEmail = new Map(records);
  const lookups: string[] = [];
  return {
    lookups,
    async findCredentialsByEmail(email: string): Promise<AuthCredentials | null> {
      lookups.push(email);
      return byEmail.get(email) ?? null;
    },
  };
}

async function productionHashFor(password: string): Promise<string> {
  return Bun.password.hash(password, { algorithm: "argon2id" });
}

describe("production authenticator (A1)", () => {
  it("accepts the correct password for a user with a real hash and takes the role from the users row", async () => {
    const repository = repositoryFor([
      [
        PRODUCTION_USER.email,
        {
          user: PRODUCTION_USER,
          passwordHash: await productionHashFor("correct-password"),
        },
      ],
    ]);
    const authenticator = createRuntimeAuthenticator(
      runtimeConfig("production", encodeDirectory([])),
      { userRepository: repository },
    );

    const user = await authenticator({
      email: PRODUCTION_USER.email,
      password: "correct-password",
    });

    expect(user).toEqual(PRODUCTION_USER);
    expect(user?.role).toBe("head_of_team");
  });

  it("rejects a wrong password for a user with a real hash", async () => {
    const repository = repositoryFor([
      [
        PRODUCTION_USER.email,
        { user: PRODUCTION_USER, passwordHash: await productionHashFor("correct-password") },
      ],
    ]);
    const authenticator = createDatabaseAuthenticator(repository);

    expect(
      await authenticator({ email: PRODUCTION_USER.email, password: "wrong-password" }),
    ).toBeNull();
  });

  it("rejects a user seeded with the dummy placeholder hash without throwing", async () => {
    const repository = repositoryFor([
      [PRODUCTION_USER.email, { user: PRODUCTION_USER, passwordHash: "dummy-hash" }],
    ]);
    const authenticator = createDatabaseAuthenticator(repository);

    await expect(
      authenticator({ email: PRODUCTION_USER.email, password: "correct-password" }),
    ).resolves.toBeNull();
  });

  it("rejects a user with an empty password hash", async () => {
    const repository = repositoryFor([
      [PRODUCTION_USER.email, { user: PRODUCTION_USER, passwordHash: "" }],
    ]);
    const authenticator = createDatabaseAuthenticator(repository);

    await expect(
      authenticator({ email: PRODUCTION_USER.email, password: "correct-password" }),
    ).resolves.toBeNull();
  });

  it("returns null for an email that has no user row", async () => {
    const repository = repositoryFor([]);
    const authenticator = createDatabaseAuthenticator(repository);

    expect(
      await authenticator({ email: "nobody@axentra.internal", password: "any-password" }),
    ).toBeNull();
    expect(repository.lookups).toEqual(["nobody@axentra.internal"]);
  });

  it("looks up the trimmed, lowercased email", async () => {
    const repository = repositoryFor([]);
    const authenticator = createDatabaseAuthenticator(repository);

    await authenticator({ email: "  Sami@Axentra.Internal ", password: "any-password" });

    expect(repository.lookups).toEqual(["sami@axentra.internal"]);
  });

  it("refuses to start production authentication without a user repository", () => {
    expect(() =>
      createRuntimeAuthenticator(runtimeConfig("production", encodeDirectory([]))),
    ).toThrow("Production authentication requires a user repository");
  });

  it("ignores the users table in development and verifies against the identity directory", async () => {
    const directory = encodeDirectory([
      {
        id: TEST_MEMBER.id,
        email: TEST_MEMBER.email,
        role: TEST_MEMBER.role,
        name: TEST_MEMBER.name,
        passwordHash: await productionHashFor("local-member-password"),
      },
    ]);
    const repository = repositoryFor([]);
    const authenticator = createRuntimeAuthenticator(runtimeConfig("development", directory), {
      userRepository: repository,
    });

    expect(
      await authenticator({ email: TEST_MEMBER.email, password: "local-member-password" }),
    ).toEqual(TEST_MEMBER);
    expect(repository.lookups).toEqual([]);
  });

  it("issues no session for a dummy-hash user through the auth service", async () => {
    const repository = repositoryFor([
      [PRODUCTION_USER.email, { user: PRODUCTION_USER, passwordHash: "dummy-hash" }],
    ]);
    const service = createAuthService({
      authenticator: createDatabaseAuthenticator(repository),
      sessionStore: new InMemoryAuthSessionStore(),
      loginAttemptStore: new InMemoryLoginAttemptStore(),
    });

    await expect(
      service.login({ email: PRODUCTION_USER.email, password: "correct-password" }),
    ).rejects.toMatchObject({ status: 401, code: "UNAUTHORIZED" });
  });
});
