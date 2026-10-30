import type { Context } from "hono";

import type { ApiEnvironment } from "../../environment";
import { jsonSuccess } from "../../http/responses";
import type { AnalyticsService } from "./analytics.service";

export type AnalyticsHandlerDependencies = {
  analyticsService: AnalyticsService;
};

export function createGetAnalyticsSummaryHandler(
  dependencies: AnalyticsHandlerDependencies,
): (context: Context<ApiEnvironment>) => Promise<Response> {
  return async (context: Context<ApiEnvironment>): Promise<Response> => {
    const summary = await dependencies.analyticsService.getSummary();
    return jsonSuccess(context, summary, 200);
  };
}
