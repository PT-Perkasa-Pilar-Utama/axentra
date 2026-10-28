import { describe, expect, it } from "bun:test";
import { createPasswordVerifier, DUMMY_ARGON2ID_HASH, type HashVerifier } from "./auth.password";
import { captureLogger } from "./auth.test-support";

const USER_ID = "33333333-3333-4333-8333-333333333333";
const PASSWORD = "correct-password";
const WARN_LEVEL = 40;

type RecordingHashVerifier = { verifyHash: HashVerifier; checkedHashes: string[] };

// Records the hash each check receives; `answer` decides the result or throws.
function recordingHashVerifier(answer: (passwordHash: string) => boolean): RecordingHashVerifier {
  const checkedHashes: string[] = [];
  return {
    checkedHashes,
    verifyHash: async (_password, passwordHash) => {
      checkedHashes.push(passwordHash);
      return answer(passwordHash);
    },
  };
}

function bunVerificationError(): Error {
  return Object.assign(new Error('Password verification failed with error "InvalidEncoding"'), {
    code: "PASSWORD_INVALID_ENCODING",
  });
}

describe("DUMMY_ARGON2ID_HASH (F3)", () => {
  it("is a well-formed Argon2id hash that the password does not match", async () => {
    const matches = await Bun.password.verify(PASSWORD, DUMMY_ARGON2ID_HASH);

    expect(matches).toBe(false);
  });

  it("has the same cost parameters as Bun's default Argon2id hash, so it costs the same time", async () => {
    const fresh = await Bun.password.hash(PASSWORD, { algorithm: "argon2id" });

    expect(DUMMY_ARGON2ID_HASH.split("$").slice(1, 4)).toEqual(fresh.split("$").slice(1, 4));
  });
});

describe("createPasswordVerifier", () => {
  it("accepts the right password for an Argon2id hash", async () => {
    const { logger } = captureLogger();
    const passwords = createPasswordVerifier({ logger });
    const passwordHash = await Bun.password.hash(PASSWORD, { algorithm: "argon2id" });

    const matches = await passwords.verify(PASSWORD, { userId: USER_ID, passwordHash });

    expect(matches).toBe(true);
  });

  it("refuses a wrong password for an Argon2id hash without logging", async () => {
    const captured = captureLogger();
    const passwords = createPasswordVerifier({ logger: captured.logger });
    const passwordHash = await Bun.password.hash(PASSWORD, { algorithm: "argon2id" });

    const matches = await passwords.verify("wrong-password", { userId: USER_ID, passwordHash });

    expect(matches).toBe(false);
    expect(captured.entries()).toEqual([]);
  });

  it("runs exactly one check, against the dummy hash, for an unknown account (F3)", async () => {
    const captured = captureLogger();
    const recorder = recordingHashVerifier(() => false);
    const passwords = createPasswordVerifier({
      logger: captured.logger,
      verifyHash: recorder.verifyHash,
    });

    const outcome = await passwords.rejectUnknownAccount(PASSWORD);

    expect(outcome).toBe(false);
    expect(recorder.checkedHashes).toEqual([DUMMY_ARGON2ID_HASH]);
    expect(captured.entries()).toEqual([]);
  });

  it.each(["bcrypt", "argon2i", "argon2d"] as const)(
    "refuses the right password for a stored %s hash and logs a warning with the user id (F29)",
    async (algorithm) => {
      const captured = captureLogger();
      const passwords = createPasswordVerifier({ logger: captured.logger });
      const passwordHash =
        algorithm === "bcrypt"
          ? await Bun.password.hash(PASSWORD, { algorithm, cost: 4 })
          : await Bun.password.hash(PASSWORD, { algorithm });

      const matches = await passwords.verify(PASSWORD, { userId: USER_ID, passwordHash });

      expect(matches).toBe(false);
      expect(captured.entries()).toEqual([
        expect.objectContaining({
          level: WARN_LEVEL,
          userId: USER_ID,
          msg: "Stored password hash is not Argon2id; login refused",
        }),
      ]);
      expect(captured.output()).not.toContain(passwordHash);
      expect(captured.output()).not.toContain(PASSWORD);
    },
  );

  it("never passes a hash that is not Argon2id to the hash verifier, and spends one dummy check instead", async () => {
    const recorder = recordingHashVerifier(() => true);
    const passwords = createPasswordVerifier({
      logger: captureLogger().logger,
      verifyHash: recorder.verifyHash,
    });

    const matches = await passwords.verify(PASSWORD, {
      userId: USER_ID,
      passwordHash: "dummy-hash",
    });

    expect(matches).toBe(false);
    expect(recorder.checkedHashes).toEqual([DUMMY_ARGON2ID_HASH]);
  });

  it("refuses a malformed Argon2id hash that makes Bun throw, and logs the summarized error (F4)", async () => {
    const captured = captureLogger();
    const passwords = createPasswordVerifier({ logger: captured.logger });
    const passwordHash = "$argon2id$v=19$m=65536,t=2,p=1$not-a-valid-hash";

    const matches = await passwords.verify(PASSWORD, { userId: USER_ID, passwordHash });

    expect(matches).toBe(false);
    expect(captured.entries()).toEqual([
      expect.objectContaining({
        level: WARN_LEVEL,
        userId: USER_ID,
        error: expect.objectContaining({ code: "PASSWORD_INVALID_ENCODING" }),
        msg: "Password verification failed; login refused",
      }),
    ]);
    expect(captured.output()).not.toContain(passwordHash);
    expect(captured.output()).not.toContain(PASSWORD);
  });

  it("follows a verifier error with one dummy check, so the refusal costs a full check (F4)", async () => {
    const recorder = recordingHashVerifier((passwordHash) => {
      if (passwordHash === DUMMY_ARGON2ID_HASH) return false;
      throw bunVerificationError();
    });
    const passwords = createPasswordVerifier({
      logger: captureLogger().logger,
      verifyHash: recorder.verifyHash,
    });
    const passwordHash = "$argon2id$v=19$m=65536,t=2,p=1$stored$hash";

    const matches = await passwords.verify(PASSWORD, { userId: USER_ID, passwordHash });

    expect(matches).toBe(false);
    expect(recorder.checkedHashes).toEqual([passwordHash, DUMMY_ARGON2ID_HASH]);
  });

  it("logs a warning without a user id when the dummy check itself throws", async () => {
    const captured = captureLogger();
    const passwords = createPasswordVerifier({
      logger: captured.logger,
      verifyHash: recordingHashVerifier(() => {
        throw bunVerificationError();
      }).verifyHash,
    });

    const outcome = await passwords.rejectUnknownAccount(PASSWORD);

    expect(outcome).toBe(false);
    const entries = captured.entries();
    expect(entries).toEqual([
      expect.objectContaining({
        level: WARN_LEVEL,
        error: expect.objectContaining({ code: "PASSWORD_INVALID_ENCODING" }),
      }),
    ]);
    expect(entries[0]).not.toHaveProperty("userId");
  });
});
