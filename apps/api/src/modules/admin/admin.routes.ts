import { Hono } from "hono";
import type { ApiEnvironment } from "../../environment";
import { defaultTokenVerifier, requireAuth, requireRole } from "../../middleware/auth";
import type { TokenVerifier } from "../../middleware/auth";
import {
  createArchiveAdminDocumentHandler,
  createDeleteAdminDocumentHandler,
  createGetAdminDocumentDetailHandler,
  createGetAdminSummaryHandler,
  createListAdminDocumentsHandler,
  createUnarchiveAdminDocumentHandler,
} from "./admin.handler";
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

  routes.get(
    "/documents",
    requireAuth(verifier),
    requireRole("admin"),
    createListAdminDocumentsHandler(dependencies),
  );

  routes.get(
    "/documents/:id",
    requireAuth(verifier),
    requireRole("admin"),
    createGetAdminDocumentDetailHandler(dependencies),
  );

  routes.post(
    "/documents/:id/archive",
    requireAuth(verifier),
    requireRole("admin"),
    createArchiveAdminDocumentHandler(dependencies),
  );

  routes.post(
    "/documents/:id/unarchive",
    requireAuth(verifier),
    requireRole("admin"),
    createUnarchiveAdminDocumentHandler(dependencies),
  );

  routes.delete(
    "/documents/:id",
    requireAuth(verifier),
    requireRole("admin"),
    createDeleteAdminDocumentHandler(dependencies),
  );

  return routes;
}
