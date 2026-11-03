import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getAnalyticsSummary } from "./analytics.api";
import type { AnalyticsSummary } from "./analytics.api";

export const ANALYTICS_QUERY_KEY = ["analytics", "summary"] as const;

const ANALYTICS_STALE_TIME_MS = 30 * 1000;
const ANALYTICS_RETRY_COUNT = 1;

export type AnalyticsPresenter = {
  summary?: AnalyticsSummary | undefined;
  isLoading: boolean;
  isError: boolean;
  retry: () => Promise<void>;
};

export function useAnalyticsPresenter(): AnalyticsPresenter {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ANALYTICS_QUERY_KEY,
    queryFn: getAnalyticsSummary,
    staleTime: ANALYTICS_STALE_TIME_MS,
    retry: ANALYTICS_RETRY_COUNT,
  });

  const retry = useCallback(async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: ANALYTICS_QUERY_KEY });
  }, [queryClient]);

  return {
    summary: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    retry,
  };
}
