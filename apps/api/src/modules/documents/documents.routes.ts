import { Hono } from "hono";
import type { ApiEnvironment } from "../../environment";
import type { TokenVerifier } from "../../middleware/auth";
import { defaultTokenVerifier, requireAuth, requireRole } from "../../middleware/auth";
import { createDocumentUploadHandler } from "./documents.handler";
import { createCheckDuplicateHandler } from "./duplicate.handler";
import { createListRecentDocumentsHandler } from "./documents.list.handler";
import { createGetDocumentMetadataHandler } from "./metadata.handler";
import { createGetDocumentSmartTagsHandler } from "./smart-tags.handler";
import { createGetDocumentCategoryHandler } from "./category.handler";
import { createListRelatedDocumentsHandler } from "./related.handler";
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

  routes.get(
    "/",
    requireAuth(verifier),
    requireRole(["member_team", "head_of_team"]),
    createListRecentDocumentsHandler(dependencies),
  );

  if (dependencies.enableUploadRoute === true) {
    routes.post(
      "/upload",
      requireAuth(verifier),
      requireRole("member_team"),
      createDocumentUploadHandler(dependencies),
    );
  }

  routes.post(
    "/check-duplicate",
    requireAuth(verifier),
    requireRole(["member_team", "head_of_team"]),
    createCheckDuplicateHandler(dependencies),
  );

  routes.get(
    "/:id/related",
    requireAuth(verifier),
    requireRole(["member_team", "head_of_team"]),
    createListRelatedDocumentsHandler(dependencies),
  );

  routes.get(
    "/:id/metadata",
    requireAuth(verifier),
    requireRole(["member_team", "head_of_team"]),
    createGetDocumentMetadataHandler(dependencies),
  );

  routes.get(
    "/:id/smart-tags",
    requireAuth(verifier),
    requireRole(["member_team", "head_of_team"]),
    createGetDocumentSmartTagsHandler(dependencies),
  );

  routes.get(
    "/:id/category",
    requireAuth(verifier),
    requireRole(["member_team", "head_of_team"]),
    createGetDocumentCategoryHandler(dependencies),
  );

  return routes;
}
