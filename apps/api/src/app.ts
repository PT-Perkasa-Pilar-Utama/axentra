import { Hono } from "hono";
import type { Logger } from "@axentra/observability";
import type { ApiEnvironment } from "./environment";
import type { DependencyCheck } from "./modules/health/health.service";
import { isAppError } from "./http/errors";
import { jsonError } from "./http/responses";
import { defaultTokenVerifier, type TokenVerifier } from "./middleware/auth";
import { requestContextMiddleware } from "./middleware/request-context";
import { createHealthRoutes } from "./modules/health/health.routes";
import { createAuthRoutes } from "./modules/auth/auth.routes";
import type { AuthService } from "./modules/auth/auth.service";

export type AppDependencies = {
  logger: Logger;
  version: string;
  readinessChecks: ReadonlyArray<DependencyCheck>;
  tokenVerifier?: TokenVerifier | undefined;
  authService?: AuthService | undefined;
};

export function createApp(dependencies: AppDependencies): Hono<ApiEnvironment> {
  const app = new Hono<ApiEnvironment>();
  app.use("*", requestContextMiddleware(dependencies.logger));

  app.route(
    "/api/v1/health",
    createHealthRoutes({
      service: "axentra-api",
      version: dependencies.version,
      readinessChecks: dependencies.readinessChecks,
    }),
  );

  app.route(
    "/api/v1/auth",
    createAuthRoutes({
      tokenVerifier: dependencies.tokenVerifier ?? defaultTokenVerifier,
      authService: dependencies.authService,
    }),
  );

  app.notFound((context) => jsonError(context, "NOT_FOUND", "Endpoint tidak ditemukan", 404));

  app.onError((error, context) => {
    if (isAppError(error)) {
      return jsonError(context, error.code, error.message, error.status, error.details);
    }
    context.get("logger").error({ error }, "unhandled API error");
    return jsonError(context, "INTERNAL_ERROR", "Terjadi kesalahan pada server", 500);
  });

  return app;
}
