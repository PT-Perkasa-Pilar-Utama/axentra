import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { DownloadAuditEvent } from "./audit-trail.api";
import { listDownloadAuditEvents } from "./audit-trail.api";
import { formatAuditDate, formatAuditDateTime } from "./audit-trail.format";

export const AUDIT_DOWNLOADS_QUERY_KEY = ["audit-downloads"] as const;
export const AUDIT_PAGE_SIZE = 10;

export type AuditDownloadEntry = {
  id: string;
  userId: string | null;
  userName: string;
  userEmail: string | null;
  downloadedAt: string;
  downloadedAtFormatted: string;
};

export type AuditDocumentGroup = {
  key: string;
  documentId: string | null;
  documentName: string;
  totalDownloads: number;
  latestDownloadedAt: string;
  latestDateFormatted: string;
  logs: AuditDownloadEntry[];
};

export type AuditTrailPresenterOptions = {
  auditFetchFn?: () => Promise<DownloadAuditEvent[]>;
  pageSize?: number;
};

export type AuditTrailPresenter = {
  isLoading: boolean;
  isError: boolean;
  isEmpty: boolean;
  items: AuditDocumentGroup[];
  totalItems: number;
  keyword: string;
  setKeyword: (keyword: string) => void;
  page: number;
  totalPages: number;
  hasPrevPage: boolean;
  hasNextPage: boolean;
  prevPage: () => void;
  nextPage: () => void;
  selectedDocument: AuditDocumentGroup | null;
  openDetail: (key: string) => void;
  closeDetail: () => void;
  refresh: () => Promise<void>;
  retry: () => Promise<void>;
};

export function aggregateAuditEvents(events: readonly DownloadAuditEvent[]): AuditDocumentGroup[] {
  const groupsMap = new Map<string, AuditDocumentGroup>();

  for (const event of events) {
    const key = event.documentId ?? event.documentName;
    const entry: AuditDownloadEntry = {
      id: event.id,
      userId: event.userId ?? null,
      userName: event.userName?.trim() || event.userEmail?.trim() || "Pengguna",
      userEmail: event.userEmail ?? null,
      downloadedAt: event.downloadedAt,
      downloadedAtFormatted: formatAuditDateTime(event.downloadedAt),
    };
    const existing = groupsMap.get(key);

    if (existing) {
      existing.logs.push(entry);
      existing.totalDownloads += 1;
      if (Date.parse(event.downloadedAt) > Date.parse(existing.latestDownloadedAt)) {
        existing.latestDownloadedAt = event.downloadedAt;
        existing.latestDateFormatted = formatAuditDate(event.downloadedAt);
      }
    } else {
      groupsMap.set(key, {
        key,
        documentId: event.documentId ?? null,
        documentName: event.documentName,
        totalDownloads: 1,
        latestDownloadedAt: event.downloadedAt,
        latestDateFormatted: formatAuditDate(event.downloadedAt),
        logs: [entry],
      });
    }
  }

  const groups = Array.from(groupsMap.values());
  for (const group of groups) {
    group.logs.sort((a, b) => Date.parse(b.downloadedAt) - Date.parse(a.downloadedAt));
  }
  groups.sort((a, b) => Date.parse(b.latestDownloadedAt) - Date.parse(a.latestDownloadedAt));
  return groups;
}

export function useAuditTrailPresenter(
  options: AuditTrailPresenterOptions = {},
): AuditTrailPresenter {
  const queryClient = useQueryClient();
  const fetchFn = options.auditFetchFn ?? listDownloadAuditEvents;
  const pageSize = options.pageSize ?? AUDIT_PAGE_SIZE;
  const [keyword, setKeywordState] = useState("");
  const [page, setPage] = useState(1);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const query = useQuery({
    queryKey: AUDIT_DOWNLOADS_QUERY_KEY,
    queryFn: fetchFn,
    staleTime: 30_000,
  });

  const groups = useMemo(() => aggregateAuditEvents(query.data ?? []), [query.data]);
  const filtered = useMemo(() => {
    const term = keyword.trim().toLocaleLowerCase("id-ID");
    if (!term) return groups;
    return groups.filter(
      (group) =>
        group.documentName.toLocaleLowerCase("id-ID").includes(term) ||
        group.logs.some((log) => log.userName.toLocaleLowerCase("id-ID").includes(term)),
    );
  }, [groups, keyword]);

  const totalItems = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(page, totalPages);
  const items = useMemo(
    () => filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [currentPage, filtered, pageSize],
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
  const openDetail = useCallback((key: string): void => setSelectedKey(key), []);
  const closeDetail = useCallback((): void => setSelectedKey(null), []);
  const selectedDocument = groups.find((group) => group.key === selectedKey) ?? null;
  const refresh = useCallback(async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: AUDIT_DOWNLOADS_QUERY_KEY });
  }, [queryClient]);
  const retry = useCallback(async (): Promise<void> => {
    await query.refetch();
  }, [query]);

  return {
    isLoading: query.isPending,
    isError: query.isError,
    isEmpty: !query.isPending && !query.isError && filtered.length === 0,
    items,
    totalItems,
    keyword,
    setKeyword,
    page: currentPage,
    totalPages,
    hasPrevPage: currentPage > 1,
    hasNextPage: currentPage < totalPages,
    prevPage,
    nextPage,
    selectedDocument,
    openDetail,
    closeDetail,
    refresh,
    retry,
  };
}
