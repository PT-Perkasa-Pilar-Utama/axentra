import type { Logger } from "@axentra/observability";
import type { AuthUser } from "@axentra/shared";

export type ApiEnvironment = {
  Variables: {
    requestId: string;
    logger: Logger;
    currentUser?: AuthUser;
  };
};
