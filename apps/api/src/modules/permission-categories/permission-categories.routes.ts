import { Hono } from "hono";
import type { ApiEnvironment } from "../../environment";
import type { TokenVerifier } from "../../middleware/auth";
import { defaultTokenVerifier, requireAuth, requireRole } from "../../middleware/auth";
import {
  createListPermissionCategoriesHandler,
  createUpdatePermissionCategoryHandler,
} from "./permission-categories.handler";
import type { IPermissionCategoriesService } from "./permission-categories.service";

export type PermissionCategoriesRouteDependencies = {
  permissionCategoriesService: IPermissionCategoriesService;
  tokenVerifier?: TokenVerifier | undefined;
};

export function createPermissionCategoriesRoutes(
  dependencies: PermissionCategoriesRouteDependencies,
): Hono<ApiEnvironment> {
  const verifier = dependencies.tokenVerifier ?? defaultTokenVerifier;
  const routes = new Hono<ApiEnvironment>();

  routes.get(
    "/",
    requireAuth(verifier),
    requireRole("head_of_team"),
    createListPermissionCategoriesHandler(dependencies),
  );

  routes.patch(
    "/:categoryId",
    requireAuth(verifier),
    requireRole("head_of_team"),
    createUpdatePermissionCategoryHandler(dependencies),
  );

  return routes;
}
