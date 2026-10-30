import { Hono } from "hono";
import { cors } from "hono/cors";
import { DEFAULT_WEB_ORIGIN, type ApiConfig } from "@axentra/config";
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
import { createDocumentRoutes } from "./modules/documents/documents.routes";
import type { DocumentService } from "./modules/documents/documents.service";
import { createTagsRoutes } from "./modules/tags/tags.routes";
import type { TopTagsService } from "./modules/tags/tags.service";
import { createSearchRoutes } from "./modules/search/search.routes";
import type { SearchService } from "./modules/search/search.service";
import { createCategoriesRoutes } from "./modules/categories/categories.routes";
import type { CategoriesService } from "./modules/categories/categories.service";
import { createAuditRoutes } from "./modules/audit/audit.routes";
import type { IAuditService } from "./modules/audit/audit.service";

export type AppDependencies = {
  logger: Logger;
  version: string;
  readinessChecks: ReadonlyArray<DependencyCheck>;
  tokenVerifier?: TokenVerifier | undefined;
  authService?: AuthService | undefined;
  documentService?: DocumentService | undefined;
  topTagsService?: TopTagsService | undefined;
  searchService?: SearchService | undefined;
  categoriesService?: CategoriesService | undefined;
  auditService?: IAuditService | undefined;
  enableUploadRoute?: boolean | undefined;
  // The one browser origin allowed to call the API with credentials. Outside production it defaults to the
  // local Web dev server.
  webOrigin?: string | undefined;
  appEnvironment?: ApiConfig["APP_ENV"] | undefined;
};

// Production must name its Web origin, as config validation already requires of WEB_ORIGIN.
function resolveWebOrigin(dependencies: AppDependencies): string {
  if (dependencies.webOrigin !== undefined) return dependencies.webOrigin;
  if (dependencies.appEnvironment === "production") {
    throw new Error("A production API requires an explicit web origin");
  }
  return DEFAULT_WEB_ORIGIN;
}

export function createApp(dependencies: AppDependencies): Hono<ApiEnvironment> {
  const app = new Hono<ApiEnvironment>();
  app.use("*", requestContextMiddleware(dependencies.logger));
  app.use(
    "*",
    cors({
      origin: resolveWebOrigin(dependencies),
      credentials: true,
      allowHeaders: ["Content-Type", "Authorization"],
      allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    }),
  );

  app.route(
    "/api/v1/health",
    createHealthRoutes({
      service: "axentra-api",
      version: dependencies.version,
      readinessChecks: dependencies.readinessChecks,
    }),
  );

  const tokenVerifier =
    dependencies.tokenVerifier ?? dependencies.authService?.tokenVerifier ?? defaultTokenVerifier;

  app.route(
    "/api/v1/auth",
    createAuthRoutes({
      tokenVerifier,
      authService: dependencies.authService,
      appEnvironment: dependencies.appEnvironment,
    }),
  );

  if (dependencies.documentService) {
    app.route(
      "/api/v1/documents",
      createDocumentRoutes({
        tokenVerifier,
        documentService: dependencies.documentService,
        enableUploadRoute: dependencies.enableUploadRoute ?? false,
      }),
    );
  }

  if (dependencies.topTagsService) {
    app.route(
      "/api/v1/tags",
      createTagsRoutes({
        tokenVerifier,
        service: dependencies.topTagsService,
      }),
    );
  }

  if (dependencies.searchService) {
    app.route(
      "/api/v1/search",
      createSearchRoutes({
        tokenVerifier,
        searchService: dependencies.searchService,
      }),
    );
  }

  if (dependencies.categoriesService) {
    app.route(
      "/api/v1/categories",
      createCategoriesRoutes({
        tokenVerifier,
        categoriesService: dependencies.categoriesService,
      }),
    );
  }

  if (dependencies.auditService) {
    app.route(
      "/api/v1/audit",
      createAuditRoutes({
        tokenVerifier,
        auditService: dependencies.auditService,
      }),
    );
  }

  app.notFound((context) => jsonError(context, "NOT_FOUND", "Endpoint tidak ditemukan", 404));

  app.onError((error, context) => {
    if (isAppError(error)) {
      return jsonError(context, error.code, error.message, error.status, error.details);
    }
    const reqLogger = context.get("logger") ?? dependencies.logger;
    reqLogger.error({ error }, "unhandled API error");
    return jsonError(context, "INTERNAL_ERROR", "Terjadi kesalahan pada server", 500);
  });

  return app;
}
