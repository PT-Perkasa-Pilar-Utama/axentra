import { Hono } from "hono";

import type { ApiEnvironment } from "../../environment";
import { defaultTokenVerifier, requireAuth, requireRole } from "../../middleware/auth";
import type { TokenVerifier } from "../../middleware/auth";
import { createGetAnalyticsSummaryHandler } from "./analytics.handler";
import type { AnalyticsService } from "./analytics.service";

export type AnalyticsRouteDependencies = {
  analyticsService: AnalyticsService;
  tokenVerifier?: TokenVerifier | undefined;
};

export function createAnalyticsRoutes(
  dependencies: AnalyticsRouteDependencies,
): Hono<ApiEnvironment> {
  const verifier = dependencies.tokenVerifier ?? defaultTokenVerifier;
  const routes = new Hono<ApiEnvironment>();

  routes.get(
    "/summary",
    requireAuth(verifier),
    requireRole("head_of_team"),
    createGetAnalyticsSummaryHandler(dependencies),
  );

  return routes;
}
