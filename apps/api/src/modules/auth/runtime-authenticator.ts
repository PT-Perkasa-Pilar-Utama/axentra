import type { ApiConfig } from "@axentra/config";
import type { UserAuthenticator } from "./auth.service";
import { createLocalIdentityAuthenticator } from "./local-identity";

export function createRuntimeAuthenticator(config: ApiConfig): UserAuthenticator {
  if (config.APP_ENV === "production") {
    return () => null;
  }
  return createLocalIdentityAuthenticator(config.AUTH_LOCAL_IDENTITY_DIRECTORY);
}
