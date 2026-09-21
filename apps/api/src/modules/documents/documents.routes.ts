import { Hono } from "hono";
import type { ApiEnvironment } from "../../environment";
import type { TokenVerifier } from "../../middleware/auth";
import { requireAuth, requireRole } from "../../middleware/auth";
import type { DocumentHandlerDependencies } from "./documents.handler";
import { createDocumentUploadHandler } from "./documents.handler";
import { createGetDocumentMetadataHandler } from "./metadata.handler";

export type DocumentRouteDependencies = DocumentHandlerDependencies & {
  tokenVerifier?: TokenVerifier | undefined;
  enableUploadRoute?: boolean | undefined;
};

export function createDocumentRoutes(
  dependencies: DocumentRouteDependencies,
): Hono<ApiEnvironment> {
  const routes = new Hono<ApiEnvironment>();

  if (dependencies.enableUploadRoute === true) {
    routes.post(
      "/upload",
      requireAuth(dependencies.tokenVerifier),
      requireRole("member_team"),
      createDocumentUploadHandler(dependencies),
    );
  }

  routes.get(
    "/:id/metadata",
    requireAuth(dependencies.tokenVerifier),
    requireRole(["member_team", "head_of_team"]),
    createGetDocumentMetadataHandler(dependencies),
  );

  return routes;
}
