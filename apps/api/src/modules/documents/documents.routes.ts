import { Hono } from "hono";
import type { ApiEnvironment } from "../../environment";
import type { TokenVerifier } from "../../middleware/auth";
import { defaultTokenVerifier, requireAuth, requireRole } from "../../middleware/auth";
import { createDocumentUploadHandler } from "./documents.handler";
import { createGetDocumentMetadataHandler } from "./metadata.handler";
import type { DocumentService } from "./documents.service";

export type DocumentRouteDependencies = {
  documentService: DocumentService;
  tokenVerifier?: TokenVerifier | undefined;
  enableUploadRoute?: boolean | undefined;
};

export type DocumentRoutesDependencies = DocumentRouteDependencies;

export function createDocumentRoutes(
  dependencies: DocumentRouteDependencies,
): Hono<ApiEnvironment> {
  const verifier = dependencies.tokenVerifier ?? defaultTokenVerifier;
  const routes = new Hono<ApiEnvironment>();

  if (dependencies.enableUploadRoute === true) {
    routes.post(
      "/upload",
      requireAuth(verifier),
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
