import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DOWNLOAD_AUDIT_MAX_PAGE, downloadAuditListQuerySchema } from "@axentra/shared";
import type { DownloadAuditEvent, DownloadAuditPage } from "./audit-trail.api";
import { listDownloadAuditEvents } from "./audit-trail.api";
import { formatAuditDateTime } from "./audit-trail.format";
import { ApiClientError } from "../../lib/api-client";

export const AUDIT_DOWNLOADS_QUERY_KEY = ["audit-downloads"] as const;
export const AUDIT_PAGE_SIZE = 10;
export const AUDIT_DOWNLOADS_STALE_TIME_MS = 30_000;

export type AuditTrailRow = DownloadAuditEvent & {
  displayUser: string;
  downloadedAtFormatted: string;
};

export type AuditTrailPresenterOptions = {
  auditFetchFn?: (page: number, limit: number) => Promise<DownloadAuditPage>;
  pageSize?: number;
};

export type AuditTrailPresenter = {
  isLoading: boolean;
  isChangingPage: boolean;
  isError: boolean;
  isAccessDenied: boolean;
  isEmpty: boolean;
  rows: AuditTrailRow[];
  totalItems: number;
  firstItem: number;
  lastItem: number;
  keyword: string;
  setKeyword: (keyword: string) => void;
  page: number;
  totalPages: number;
  hasPrevPage: boolean;
  hasNextPage: boolean;
  prevPage: () => void;
  nextPage: () => void;
  retry: () => Promise<void>;
};

export function mapAuditEvents(events: readonly DownloadAuditEvent[]): AuditTrailRow[] {
  return events.map((event) => ({
    ...event,
    displayUser: event.userName?.trim() || event.userEmail?.trim() || "Pengguna",
    downloadedAtFormatted: formatAuditDateTime(event.downloadedAt),
  }));
}

export function useAuditTrailPresenter(
  options: AuditTrailPresenterOptions = {},
): AuditTrailPresenter {
  const fetchFn = options.auditFetchFn ?? listDownloadAuditEvents;
  const { limit } = downloadAuditListQuerySchema.parse({
    limit: options.pageSize ?? AUDIT_PAGE_SIZE,
  });
  const [keyword, setKeyword] = useState("");
  const [requestedPage, setRequestedPage] = useState(1);
  const query = useQuery({
    queryKey: [...AUDIT_DOWNLOADS_QUERY_KEY, requestedPage, limit],
    queryFn: () => fetchFn(requestedPage, limit),
    staleTime: AUDIT_DOWNLOADS_STALE_TIME_MS,
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[2] === limit ? previous : undefined,
    retry: (failureCount, error) =>
      !(error instanceof ApiClientError && error.status >= 400 && error.status < 500) &&
      failureCount < 1,
  });

  const meta = query.data?.meta;
  const page = meta?.page ?? requestedPage;
  const pageSize = meta?.limit ?? limit;
  const totalItems = meta?.total ?? 0;
  const totalPages = Math.min(
    DOWNLOAD_AUDIT_MAX_PAGE,
    Math.max(1, Math.ceil(totalItems / pageSize)),
  );
  // Reset after deletions shrink the result set; conditional render updates settle before paint.
  if (meta && !query.isPlaceholderData && requestedPage > totalPages) {
    setRequestedPage(totalPages);
  }

  const events = query.data?.items;
  const pageRows = useMemo(() => mapAuditEvents(events ?? []), [events]);
  // The API has no search parameter. Never imply this filters the entire audit history.
  const rows = useMemo(() => {
    const term = keyword.trim().toLocaleLowerCase("id-ID");
    return pageRows.filter((row) =>
      [row.documentName, row.displayUser, row.userEmail ?? ""]
        .join(" ")
        .toLocaleLowerCase("id-ID")
        .includes(term),
    );
  }, [pageRows, keyword]);

  const prevPage = useCallback((): void => setRequestedPage(Math.max(1, page - 1)), [page]);
  const nextPage = useCallback(
    (): void => setRequestedPage(Math.min(totalPages, page + 1)),
    [page, totalPages],
  );
  const retry = useCallback(async (): Promise<void> => {
    await query.refetch();
  }, [query]);
  const isAccessDenied = query.error instanceof ApiClientError && query.error.status === 403;
  const canNavigate = !query.isPending && !query.isPlaceholderData && !isAccessDenied;
  const offset = (page - 1) * pageSize;

  return {
    isLoading: query.isPending,
    isChangingPage: query.isPlaceholderData,
    isError: query.isError,
    isAccessDenied,
    isEmpty: !query.isPending && !query.isError && rows.length === 0,
    rows,
    totalItems,
    firstItem: pageRows.length > 0 ? offset + 1 : 0,
    lastItem: pageRows.length > 0 ? offset + pageRows.length : 0,
    keyword,
    setKeyword,
    page,
    totalPages,
    hasPrevPage: canNavigate && page > 1,
    hasNextPage: canNavigate && !query.isError && page < totalPages,
    prevPage,
    nextPage,
    retry,
  };
}
