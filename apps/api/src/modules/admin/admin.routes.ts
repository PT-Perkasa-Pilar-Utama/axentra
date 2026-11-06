import { Hono } from "hono";
import type { ApiEnvironment } from "../../environment";
import { defaultTokenVerifier, requireAuth, requireRole } from "../../middleware/auth";
import type { TokenVerifier } from "../../middleware/auth";
import { createGetAdminSummaryHandler } from "./admin.handler";
import type { AdminService } from "./admin.service";
import {
  createListAdminUsersHandler,
  createUpdateAdminUserStatusHandler,
} from "./admin.accounts.handler";
import type { AdminAccountService } from "./admin.accounts.service";

export type AdminRouteDependencies = {
  adminService: AdminService;
  adminAccountService?: AdminAccountService | undefined;
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

  if (dependencies.adminAccountService) {
    const adminAccountService = dependencies.adminAccountService;
    routes.get(
      "/users",
      requireAuth(verifier),
      requireRole("admin"),
      createListAdminUsersHandler({ adminAccountService }),
    );
    routes.patch(
      "/users/:id/status",
      requireAuth(verifier),
      requireRole("admin"),
      createUpdateAdminUserStatusHandler({ adminAccountService }),
    );
  }

  return routes;
}
