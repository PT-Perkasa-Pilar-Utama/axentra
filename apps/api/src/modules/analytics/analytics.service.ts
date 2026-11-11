import { ANALYTICS_UPLOAD_WINDOW_DAYS, type AnalyticsSummary } from "@axentra/shared";

import { InMemoryAnalyticsRepository, type IAnalyticsRepository } from "./analytics.repository";

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

export type AnalyticsService = {
  getSummary: () => Promise<AnalyticsSummary>;
};

export type AnalyticsServiceOptions = {
  now?: (() => Date) | undefined;
};

export function createAnalyticsService(
  repository: IAnalyticsRepository = new InMemoryAnalyticsRepository(),
  options?: AnalyticsServiceOptions | undefined,
): AnalyticsService {
  const now = options?.now ?? (() => new Date());

  return {
    async getSummary(): Promise<AnalyticsSummary> {
      const uploadedSince = new Date(
        now().getTime() - ANALYTICS_UPLOAD_WINDOW_DAYS * MILLISECONDS_PER_DAY,
      );
      return repository.getSummary(uploadedSince);
    },
  };
}
