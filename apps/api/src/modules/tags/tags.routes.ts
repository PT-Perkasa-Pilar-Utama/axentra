import { Hono } from "hono";
import type { ApiEnvironment } from "../../environment";
import { defaultTokenVerifier, requireAuth, requireRole } from "../../middleware/auth";
import type { TokenVerifier } from "../../middleware/auth";
import { createListTopTagsHandler } from "./tags.handler";
import type { TopTagsService } from "./tags.service";

export type TagsRouteDependencies = {
  service: TopTagsService;
  tokenVerifier?: TokenVerifier | undefined;
};

export function createTagsRoutes(dependencies: TagsRouteDependencies): Hono<ApiEnvironment> {
  const routes = new Hono<ApiEnvironment>();
  const verifier = dependencies.tokenVerifier ?? defaultTokenVerifier;

  routes.get(
    "/top",
    requireAuth(verifier),
    requireRole(["member_team", "head_of_team"]),
    createListTopTagsHandler(dependencies),
  );

  return routes;
}
