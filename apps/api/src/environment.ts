import type { Logger } from "@axentra/observability";

export type ApiEnvironment = {
  Variables: {
    requestId: string;
    logger: Logger;
  };
};
