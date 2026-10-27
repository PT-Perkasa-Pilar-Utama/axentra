import type { ApiConfig } from "@axentra/config";
import type { UserAuthenticator } from "./auth.service";
import { normalizeEmail } from "./auth.tokens";
import type { AuthUserRepository } from "./auth.types";
import { createLocalIdentityAuthenticator, verifyPasswordHash } from "./local-identity";

export type RuntimeAuthenticatorDependencies = {
  userRepository: AuthUserRepository;
};

// Development and test verify against AUTH_LOCAL_IDENTITY_DIRECTORY. Production verifies against the users
// table, so the role always comes from the stored row.
export function createRuntimeAuthenticator(
  config: ApiConfig,
  dependencies?: RuntimeAuthenticatorDependencies,
): UserAuthenticator {
  if (config.APP_ENV === "production") {
    if (dependencies === undefined) {
      throw new Error("Production authentication requires a user repository");
    }
    return createDatabaseAuthenticator(dependencies.userRepository);
  }
  return createLocalIdentityAuthenticator(config.AUTH_LOCAL_IDENTITY_DIRECTORY);
}

export function createDatabaseAuthenticator(userRepository: AuthUserRepository): UserAuthenticator {
  return async (credentials) => {
    const record = await userRepository.findCredentialsByEmail(normalizeEmail(credentials.email));
    if (record === null) return null;

    const matches = await verifyPasswordSafely(credentials.password, record.passwordHash);
    return matches ? record.user : null;
  };
}

// Bun throws for a malformed or placeholder hash such as "dummy-hash". Such a user simply fails to log in.
async function verifyPasswordSafely(password: string, passwordHash: string): Promise<boolean> {
  try {
    return await verifyPasswordHash(password, passwordHash);
  } catch {
    return false;
  }
}
