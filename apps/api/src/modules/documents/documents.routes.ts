import { Hono } from "hono";
import type { ApiEnvironment } from "../../environment";
import type { TokenVerifier } from "../../middleware/auth";
import { requireAuth, requireRole } from "../../middleware/auth";
import type { DocumentHandlerDependencies } from "./documents.handler";
import { createDocumentUploadHandler } from "./documents.handler";

export type DocumentRouteDependencies = DocumentHandlerDependencies & {
  tokenVerifier?: TokenVerifier | undefined;
};

export function createDocumentRoutes(
  dependencies: DocumentRouteDependencies,
): Hono<ApiEnvironment> {
  const routes = new Hono<ApiEnvironment>();
  routes.post(
    "/upload",
    requireAuth(dependencies.tokenVerifier),
    requireRole("member_team"),
    createDocumentUploadHandler(dependencies),
  );
  return routes;
}
