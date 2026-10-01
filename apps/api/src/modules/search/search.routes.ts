import { Hono } from "hono";
import type { ApiEnvironment } from "../../environment";
import { defaultTokenVerifier, requireAuth, requireRole } from "../../middleware/auth";
import type { TokenVerifier } from "../../middleware/auth";
import { createSearchDocumentsHandler } from "./search.handler";
import type { SearchService } from "./search.service";

export type SearchRouteDependencies = {
  searchService: SearchService;
  tokenVerifier?: TokenVerifier | undefined;
};

export function createSearchRoutes(dependencies: SearchRouteDependencies): Hono<ApiEnvironment> {
  const routes = new Hono<ApiEnvironment>();
  const verifier = dependencies.tokenVerifier ?? defaultTokenVerifier;

  routes.get(
    "/documents",
    requireAuth(verifier),
    requireRole(["member_team", "head_of_team"]),
    createSearchDocumentsHandler(dependencies),
  );

  return routes;
}
