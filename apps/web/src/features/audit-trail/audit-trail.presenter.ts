import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { DownloadAuditEvent } from "./audit-trail.api";
import { listDownloadAuditEvents } from "./audit-trail.api";
import { formatAuditDateTime } from "./audit-trail.format";

export const AUDIT_DOWNLOADS_QUERY_KEY = ["audit-downloads"] as const;
export const AUDIT_PAGE_SIZE = 10;

export type AuditTrailRow = DownloadAuditEvent & {
  displayUser: string;
  downloadedAtFormatted: string;
};

export type AuditTrailPresenterOptions = {
  auditFetchFn?: () => Promise<DownloadAuditEvent[]>;
  pageSize?: number;
};

export type AuditTrailPresenter = {
  isLoading: boolean;
  isError: boolean;
  isAccessDenied: boolean;
  isEmpty: boolean;
  rows: AuditTrailRow[];
  totalItems: number;
  pageSize: number;
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
  return [...events]
    .sort((a, b) => Date.parse(b.downloadedAt) - Date.parse(a.downloadedAt))
    .map((event) => ({
      ...event,
      displayUser: event.userName?.trim() || event.userEmail?.trim() || "Pengguna",
      downloadedAtFormatted: formatAuditDateTime(event.downloadedAt),
    }));
}

export function useAuditTrailPresenter(
  options: AuditTrailPresenterOptions = {},
): AuditTrailPresenter {
  const fetchFn = options.auditFetchFn ?? listDownloadAuditEvents;
  const pageSize = options.pageSize ?? AUDIT_PAGE_SIZE;
  const [keyword, setKeywordState] = useState("");
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: AUDIT_DOWNLOADS_QUERY_KEY,
    queryFn: fetchFn,
    staleTime: 30_000,
  });
  const rows = useMemo(() => mapAuditEvents(query.data ?? []), [query.data]);
  const filteredRows = useMemo(() => {
    const term = keyword.trim().toLocaleLowerCase("id-ID");
    if (!term) return rows;
    return rows.filter((row) =>
      [row.documentName, row.displayUser, row.userEmail ?? ""]
        .join(" ")
        .toLocaleLowerCase("id-ID")
        .includes(term),
    );
  }, [rows, keyword]);

  const totalItems = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedRows = useMemo(
    () => filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [currentPage, filteredRows, pageSize],
  );
  const setKeyword = useCallback((value: string): void => {
    setKeywordState(value);
    setPage(1);
  }, []);
  const prevPage = useCallback((): void => setPage((value) => Math.max(1, value - 1)), []);
  const nextPage = useCallback(
    (): void => setPage((value) => Math.min(totalPages, value + 1)),
    [totalPages],
  );
  const retry = useCallback(async (): Promise<void> => {
    await query.refetch();
  }, [query]);

  return {
    isLoading: query.isPending,
    isError: query.isError,
    isAccessDenied:
      query.error instanceof Error && "status" in query.error && query.error.status === 403,
    isEmpty: !query.isPending && !query.isError && filteredRows.length === 0,
    rows: paginatedRows,
    totalItems,
    pageSize,
    keyword,
    setKeyword,
    page: currentPage,
    totalPages,
    hasPrevPage: currentPage > 1,
    hasNextPage: currentPage < totalPages,
    prevPage,
    nextPage,
    retry,
  };
}
