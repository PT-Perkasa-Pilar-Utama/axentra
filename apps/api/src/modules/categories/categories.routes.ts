import { Hono } from "hono";
import type { ApiEnvironment } from "../../environment";
import type { TokenVerifier } from "../../middleware/auth";
import { defaultTokenVerifier, requireAuth, requireRole } from "../../middleware/auth";
import { createListCategoriesHandler } from "./categories.handler";
import type { CategoriesService } from "./categories.service";

export type CategoriesRouteDependencies = {
  categoriesService: CategoriesService;
  tokenVerifier?: TokenVerifier | undefined;
};

export function createCategoriesRoutes(
  dependencies: CategoriesRouteDependencies,
): Hono<ApiEnvironment> {
  const verifier = dependencies.tokenVerifier ?? defaultTokenVerifier;
  const routes = new Hono<ApiEnvironment>();

  routes.get(
    "/",
    requireAuth(verifier),
    requireRole(["member_team", "head_of_team"]),
    createListCategoriesHandler(dependencies),
  );

  return routes;
}
