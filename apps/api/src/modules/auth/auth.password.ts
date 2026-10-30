import type { Logger } from "@axentra/observability";
import { summarizeError } from "@axentra/observability";

// Argon2id verifier of a random throwaway value that was discarded after hashing, so no password matches
// it and no account stores it. Its cost (m=65536, t=2, p=1) equals Bun.password.hash defaults, which is how
// account hashes are generated, so checking a password against it takes as long as checking a real account.
export const DUMMY_ARGON2ID_HASH =
  "$argon2id$v=19$m=65536,t=2,p=1$VJ1IOXbyqzSfTzsl6CatmiQgiKG7TBsx5ZZPqxm96PM$N4f2t514gCP22khzXR4TcUg6e2FOd3piQnTg1Y3ztKc";

// Bun reads the algorithm from the stored hash, so it also verifies bcrypt, Argon2i, and Argon2d hashes, and
// passing "argon2id" to it still accepts Argon2i and Argon2d. This prefix check restricts logins to Argon2id.
const ARGON2ID_HASH_PREFIX = "$argon2id$";

const UNSUPPORTED_HASH_MESSAGE = "Stored password hash is not Argon2id; login refused";
const VERIFICATION_FAILED_MESSAGE = "Password verification failed; login refused";

// Checks a password against one stored hash. It may throw for a malformed hash.
export type HashVerifier = (password: string, passwordHash: string) => Promise<boolean>;

export type StoredPassword = {
  userId: string;
  passwordHash: string;
};

// Neither method throws. Every refusal costs one Argon2id check, so response time does not reveal why a
// login failed or whether the account exists.
export type PasswordVerifier = {
  // True only when the stored hash is Argon2id and the password matches it.
  verify(password: string, account: StoredPassword): Promise<boolean>;
  // For an email without an account.
  rejectUnknownAccount(password: string): Promise<false>;
};

export type PasswordVerifierOptions = {
  logger: Logger;
  verifyHash?: HashVerifier | undefined;
};

function verifyWithBun(password: string, passwordHash: string): Promise<boolean> {
  return Bun.password.verify(password, passwordHash);
}

// The one verifier for the development identity directory and the production users table.
export function createPasswordVerifier(options: PasswordVerifierOptions): PasswordVerifier {
  const { logger } = options;
  const verifyHash = options.verifyHash ?? verifyWithBun;

  async function rejectAfterDummyCheck(password: string): Promise<false> {
    try {
      await verifyHash(password, DUMMY_ARGON2ID_HASH);
    } catch (error: unknown) {
      logger.warn({ error: summarizeError(error) }, VERIFICATION_FAILED_MESSAGE);
    }
    return false;
  }

  return {
    async verify(password: string, account: StoredPassword): Promise<boolean> {
      if (!account.passwordHash.startsWith(ARGON2ID_HASH_PREFIX)) {
        logger.warn({ userId: account.userId }, UNSUPPORTED_HASH_MESSAGE);
        return rejectAfterDummyCheck(password);
      }
      try {
        return await verifyHash(password, account.passwordHash);
      } catch (error: unknown) {
        logger.warn(
          { userId: account.userId, error: summarizeError(error) },
          VERIFICATION_FAILED_MESSAGE,
        );
        return rejectAfterDummyCheck(password);
      }
    },
    rejectUnknownAccount: rejectAfterDummyCheck,
  };
}
