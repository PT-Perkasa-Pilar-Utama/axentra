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
import {
  createArchiveAdminDocumentHandler,
  createDeleteAdminDocumentHandler,
  createGetAdminDocumentDetailHandler,
  createListAdminDocumentsHandler,
  createUnarchiveAdminDocumentHandler,
} from "./admin.documents.handler";
import type { AdminDocumentService } from "./admin.documents.service";

export type AdminRouteDependencies = {
  adminService?: AdminService | undefined;
  adminAccountService?: AdminAccountService | undefined;
  adminDocumentService?: AdminDocumentService | undefined;
  tokenVerifier?: TokenVerifier | undefined;
};

export function createAdminRoutes(dependencies: AdminRouteDependencies): Hono<ApiEnvironment> {
  const verifier = dependencies.tokenVerifier ?? defaultTokenVerifier;
  const routes = new Hono<ApiEnvironment>();

  if (dependencies.adminService) {
    const adminService = dependencies.adminService;
    routes.get(
      "/summary",
      requireAuth(verifier),
      requireRole("admin"),
      createGetAdminSummaryHandler({ adminService }),
    );
  }

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

  if (dependencies.adminDocumentService) {
    const adminDocumentService = dependencies.adminDocumentService;
    routes.get(
      "/documents",
      requireAuth(verifier),
      requireRole("admin"),
      createListAdminDocumentsHandler({ adminDocumentService }),
    );
    routes.get(
      "/documents/:id",
      requireAuth(verifier),
      requireRole("admin"),
      createGetAdminDocumentDetailHandler({ adminDocumentService }),
    );
    routes.post(
      "/documents/:id/archive",
      requireAuth(verifier),
      requireRole("admin"),
      createArchiveAdminDocumentHandler({ adminDocumentService }),
    );
    routes.post(
      "/documents/:id/unarchive",
      requireAuth(verifier),
      requireRole("admin"),
      createUnarchiveAdminDocumentHandler({ adminDocumentService }),
    );
    routes.delete(
      "/documents/:id",
      requireAuth(verifier),
      requireRole("admin"),
      createDeleteAdminDocumentHandler({ adminDocumentService }),
    );
  }

  return routes;
}
