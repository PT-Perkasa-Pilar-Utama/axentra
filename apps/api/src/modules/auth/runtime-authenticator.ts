import type { ApiConfig } from "@axentra/config";
import type { Logger } from "@axentra/observability";
import { createPasswordVerifier, type PasswordVerifier } from "./auth.password";
import type { UserAuthenticator } from "./auth.service";
import { normalizeEmail } from "./auth.tokens";
import type { AuthUserRepository } from "./auth.types";
import { createLocalIdentityAuthenticator } from "./local-identity";

export type RuntimeAuthenticatorDependencies = {
  // Receives the warning when a stored password hash cannot be verified.
  logger: Logger;
  userRepository?: AuthUserRepository | undefined;
};

// Development and test verify against AUTH_LOCAL_IDENTITY_DIRECTORY. Production verifies against the users
// table, so the role always comes from the stored row. Both use the same password verifier.
export function createRuntimeAuthenticator(
  config: ApiConfig,
  dependencies: RuntimeAuthenticatorDependencies,
): UserAuthenticator {
  const passwords = createPasswordVerifier({ logger: dependencies.logger });
  if (config.APP_ENV === "production") {
    if (dependencies.userRepository === undefined) {
      throw new Error("Production authentication requires a user repository");
    }
    return createDatabaseAuthenticator(dependencies.userRepository, passwords);
  }
  return createLocalIdentityAuthenticator(config.AUTH_LOCAL_IDENTITY_DIRECTORY, passwords);
}

export function createDatabaseAuthenticator(
  userRepository: AuthUserRepository,
  passwords: PasswordVerifier,
): UserAuthenticator {
  return async (credentials) => {
    const record = await userRepository.findCredentialsByEmail(normalizeEmail(credentials.email));
    if (record === null) {
      await passwords.rejectUnknownAccount(credentials.password);
      return null;
    }

    const matches = await passwords.verify(credentials.password, {
      userId: record.user.id,
      passwordHash: record.passwordHash,
    });
    return matches ? record.user : null;
  };
}
