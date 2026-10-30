import { Hono } from "hono";
import type { ApiEnvironment } from "../../environment";
import type { TokenVerifier } from "../../middleware/auth";
import { defaultTokenVerifier, requireAuth, requireRole } from "../../middleware/auth";
import { createListDownloadAuditEventsHandler } from "./audit.handler";
import type { IAuditService } from "./audit.service";

export type AuditRouteDependencies = {
  auditService: IAuditService;
  tokenVerifier?: TokenVerifier | undefined;
};

export function createAuditRoutes(dependencies: AuditRouteDependencies): Hono<ApiEnvironment> {
  const verifier = dependencies.tokenVerifier ?? defaultTokenVerifier;
  const routes = new Hono<ApiEnvironment>();

  routes.get(
    "/downloads",
    requireAuth(verifier),
    requireRole("head_of_team"),
    createListDownloadAuditEventsHandler(dependencies),
  );

  return routes;
}
