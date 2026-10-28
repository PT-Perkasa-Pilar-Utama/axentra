import { describe, expect, it } from "bun:test";
import type { AuthUser } from "@axentra/shared";
import type { AuthCredentials, AuthUserRepository } from "./auth.types";
import { createAuthService, type AuthService, type UserAuthenticator } from "./auth.service";
import { InMemoryAuthSessionStore, InMemoryLoginAttemptStore } from "./auth.memory-stores";
import {
  createPasswordVerifier,
  DUMMY_ARGON2ID_HASH,
  type HashVerifier,
  type PasswordVerifier,
} from "./auth.password";
import { createLocalIdentityAuthenticator } from "./local-identity";
import { createDatabaseAuthenticator, createRuntimeAuthenticator } from "./runtime-authenticator";
import {
  captureLogger,
  encodeDirectory,
  logger,
  runtimeConfig,
  TEST_MEMBER,
} from "./auth.test-support";

const PRODUCTION_USER: AuthUser = { ...TEST_MEMBER, role: "head_of_team" };
const MALFORMED_ARGON2ID_HASH = "$argon2id$v=19$m=65536,t=2,p=1$not-a-valid-hash";
const WARN_LEVEL = 40;
const INVALID_CREDENTIALS = {
  status: 401,
  code: "UNAUTHORIZED",
  message: "Email atau kata sandi salah",
};

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

function quietPasswords(): PasswordVerifier {
  return createPasswordVerifier({ logger });
}

type RecordingHashVerifier = { verifyHash: HashVerifier; checkedHashes: string[] };

// Verifies with Bun and records every hash it was asked to check.
function recordingHashVerifier(): RecordingHashVerifier {
  const checkedHashes: string[] = [];
  return {
    checkedHashes,
    verifyHash: async (password, passwordHash) => {
      checkedHashes.push(passwordHash);
      return Bun.password.verify(password, passwordHash);
    },
  };
}

function serviceFor(authenticator: UserAuthenticator): AuthService {
  return createAuthService({
    authenticator,
    sessionStore: new InMemoryAuthSessionStore(),
    loginAttemptStore: new InMemoryLoginAttemptStore(),
  });
}

function memberDirectory(passwordHash: string): string {
  return encodeDirectory([
    {
      id: TEST_MEMBER.id,
      email: TEST_MEMBER.email,
      role: TEST_MEMBER.role,
      name: TEST_MEMBER.name,
      passwordHash,
    },
  ]);
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
      { logger, userRepository: repository },
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
    const authenticator = createDatabaseAuthenticator(repository, quietPasswords());

    expect(
      await authenticator({ email: PRODUCTION_USER.email, password: "wrong-password" }),
    ).toBeNull();
  });

  it("rejects a user seeded with the dummy placeholder hash without throwing", async () => {
    const repository = repositoryFor([
      [PRODUCTION_USER.email, { user: PRODUCTION_USER, passwordHash: "dummy-hash" }],
    ]);
    const authenticator = createDatabaseAuthenticator(repository, quietPasswords());

    await expect(
      authenticator({ email: PRODUCTION_USER.email, password: "correct-password" }),
    ).resolves.toBeNull();
  });

  it("rejects a user with an empty password hash", async () => {
    const repository = repositoryFor([
      [PRODUCTION_USER.email, { user: PRODUCTION_USER, passwordHash: "" }],
    ]);
    const authenticator = createDatabaseAuthenticator(repository, quietPasswords());

    await expect(
      authenticator({ email: PRODUCTION_USER.email, password: "correct-password" }),
    ).resolves.toBeNull();
  });

  it("returns null for an email that has no user row", async () => {
    const repository = repositoryFor([]);
    const authenticator = createDatabaseAuthenticator(repository, quietPasswords());

    expect(
      await authenticator({ email: "nobody@axentra.internal", password: "any-password" }),
    ).toBeNull();
    expect(repository.lookups).toEqual(["nobody@axentra.internal"]);
  });

  it("looks up the trimmed, lowercased email", async () => {
    const repository = repositoryFor([]);
    const authenticator = createDatabaseAuthenticator(repository, quietPasswords());

    await authenticator({ email: "  Sami@Axentra.Internal ", password: "any-password" });

    expect(repository.lookups).toEqual(["sami@axentra.internal"]);
  });

  it("refuses to start production authentication without a user repository", () => {
    expect(() =>
      createRuntimeAuthenticator(runtimeConfig("production", encodeDirectory([])), { logger }),
    ).toThrow("Production authentication requires a user repository");
  });

  it("ignores the users table in development and verifies against the identity directory", async () => {
    const directory = memberDirectory(await productionHashFor("local-member-password"));
    const repository = repositoryFor([]);
    const authenticator = createRuntimeAuthenticator(runtimeConfig("development", directory), {
      logger,
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
    const service = serviceFor(createDatabaseAuthenticator(repository, quietPasswords()));

    await expect(
      service.login({ email: PRODUCTION_USER.email, password: "correct-password" }),
    ).rejects.toMatchObject({ status: 401, code: "UNAUTHORIZED" });
  });

  it("answers an unknown email exactly like a wrong password, after one Argon2id check each (F3)", async () => {
    const passwordHash = await productionHashFor("correct-password");
    const recorder = recordingHashVerifier();
    const repository = repositoryFor([
      [PRODUCTION_USER.email, { user: PRODUCTION_USER, passwordHash }],
    ]);
    const service = serviceFor(
      createDatabaseAuthenticator(
        repository,
        createPasswordVerifier({ logger, verifyHash: recorder.verifyHash }),
      ),
    );

    const unknownEmail = service.login({
      email: "nobody@axentra.internal",
      password: "x-password",
    });
    await expect(unknownEmail).rejects.toMatchObject(INVALID_CREDENTIALS);
    expect(recorder.checkedHashes).toEqual([DUMMY_ARGON2ID_HASH]);

    const wrongPassword = service.login({ email: PRODUCTION_USER.email, password: "x-password" });
    await expect(wrongPassword).rejects.toMatchObject(INVALID_CREDENTIALS);
    expect(recorder.checkedHashes).toEqual([DUMMY_ARGON2ID_HASH, passwordHash]);
  });

  it("refuses a user whose stored hash makes the verifier throw, and logs a warning with the user id (F4)", async () => {
    const captured = captureLogger();
    const repository = repositoryFor([
      [PRODUCTION_USER.email, { user: PRODUCTION_USER, passwordHash: MALFORMED_ARGON2ID_HASH }],
    ]);
    const service = serviceFor(
      createDatabaseAuthenticator(repository, createPasswordVerifier({ logger: captured.logger })),
    );

    await expect(
      service.login({ email: PRODUCTION_USER.email, password: "correct-password" }),
    ).rejects.toMatchObject(INVALID_CREDENTIALS);
    expect(captured.entries()).toEqual([
      expect.objectContaining({
        level: WARN_LEVEL,
        userId: PRODUCTION_USER.id,
        error: expect.objectContaining({ code: "PASSWORD_INVALID_ENCODING" }),
      }),
    ]);
    expect(captured.output()).not.toContain(MALFORMED_ARGON2ID_HASH);
    expect(captured.output()).not.toContain("correct-password");
  });
});

describe("development identity directory authenticator", () => {
  it("runs one dummy Argon2id check for an email that is not in the directory (F3)", async () => {
    const recorder = recordingHashVerifier();
    const authenticator = createLocalIdentityAuthenticator(
      memberDirectory(await productionHashFor("local-member-password")),
      createPasswordVerifier({ logger, verifyHash: recorder.verifyHash }),
    );

    const user = await authenticator({ email: "nobody@axentra.local", password: "x-password" });

    expect(user).toBeNull();
    expect(recorder.checkedHashes).toEqual([DUMMY_ARGON2ID_HASH]);
  });

  it("answers 401, not 500, when a directory hash makes the verifier throw, and logs a warning (F4)", async () => {
    const captured = captureLogger();
    const service = serviceFor(
      createLocalIdentityAuthenticator(
        memberDirectory(MALFORMED_ARGON2ID_HASH),
        createPasswordVerifier({ logger: captured.logger }),
      ),
    );

    await expect(
      service.login({ email: TEST_MEMBER.email, password: "local-member-password" }),
    ).rejects.toMatchObject(INVALID_CREDENTIALS);
    expect(captured.entries()).toEqual([
      expect.objectContaining({
        level: WARN_LEVEL,
        userId: TEST_MEMBER.id,
        error: expect.objectContaining({ code: "PASSWORD_INVALID_ENCODING" }),
      }),
    ]);
  });

  it("answers 401, not 500, for a directory user with the dummy-hash placeholder, and logs a warning (F4)", async () => {
    const captured = captureLogger();
    const service = serviceFor(
      createRuntimeAuthenticator(runtimeConfig("development", memberDirectory("dummy-hash")), {
        logger: captured.logger,
      }),
    );

    await expect(
      service.login({ email: TEST_MEMBER.email, password: "local-member-password" }),
    ).rejects.toMatchObject(INVALID_CREDENTIALS);
    expect(captured.entries()).toEqual([
      expect.objectContaining({ level: WARN_LEVEL, userId: TEST_MEMBER.id }),
    ]);
  });

  it("refuses the right password when the directory stores an Argon2i hash (F29)", async () => {
    const captured = captureLogger();
    const authenticator = createLocalIdentityAuthenticator(
      memberDirectory(await Bun.password.hash("local-member-password", { algorithm: "argon2i" })),
      createPasswordVerifier({ logger: captured.logger }),
    );

    const user = await authenticator({
      email: TEST_MEMBER.email,
      password: "local-member-password",
    });

    expect(user).toBeNull();
    expect(captured.entries()).toEqual([
      expect.objectContaining({
        level: WARN_LEVEL,
        userId: TEST_MEMBER.id,
        msg: "Stored password hash is not Argon2id; login refused",
      }),
    ]);
  });
});
