import { Hono } from "hono";
import type { ApiEnvironment } from "../../environment";
import { defaultTokenVerifier, requireAuth, requireRole } from "../../middleware/auth";
import type { TokenVerifier } from "../../middleware/auth";
import { createGetAdminSummaryHandler } from "./admin.handler";
import type { AdminService } from "./admin.service";

export type AdminRouteDependencies = {
  adminService: AdminService;
  tokenVerifier?: TokenVerifier | undefined;
};

export function createAdminRoutes(dependencies: AdminRouteDependencies): Hono<ApiEnvironment> {
  const verifier = dependencies.tokenVerifier ?? defaultTokenVerifier;
  const routes = new Hono<ApiEnvironment>();

  routes.get(
    "/summary",
    requireAuth(verifier),
    requireRole("admin"),
    createGetAdminSummaryHandler(dependencies),
  );

  return routes;
}
