import { useQuery } from "@tanstack/react-query";
import { getPlatformStatus } from "./platform-status.api";

export type PlatformStatusPresenter = {
  status: "loading" | "ready" | "error";
  service: string | undefined;
  version: string | undefined;
  retry: () => void;
};

export function usePlatformStatusPresenter(): PlatformStatusPresenter {
  const query = useQuery({
    queryKey: ["platform-status"],
    queryFn: getPlatformStatus,
    retry: 1,
    refetchInterval: 30000,
  });

  let status: PlatformStatusPresenter["status"] = "ready";
  if (query.isPending) status = "loading";
  if (query.isError) status = "error";
  return {
    status,
    service: query.data?.service,
    version: query.data?.version,
    retry: () => void query.refetch(),
  };
}
