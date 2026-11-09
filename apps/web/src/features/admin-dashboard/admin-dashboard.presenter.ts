import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { AdminSummary } from "@axentra/shared";

import { createTransientRetry } from "../../lib/query-retry";
import { getAdminSummary } from "./admin-dashboard.api";
import type { AdminRoleBreakdownRow } from "./admin-role-breakdown.view";
import type { AdminStatCardProps } from "./admin-stat-card.view";

export const ADMIN_SUMMARY_QUERY_KEY = ["admin", "summary"] as const;

const ADMIN_SUMMARY_STALE_TIME_MS = 30 * 1000;
const ADMIN_SUMMARY_RETRY_COUNT = 1;
const FULL_BAR_PERCENT = 100;
const DASHBOARD_TIME_ZONE = "Asia/Jakarta";
const NO_DOWNLOAD_CAPTION = "Belum ada unduhan";
const TOTAL_DOCUMENTS_CAPTION = "Tidak termasuk yang dihapus";

const ROLE_ROWS = [
  { id: "member_team", label: "Member Team" },
  { id: "head_of_team", label: "Head of Team" },
  { id: "admin", label: "Admin" },
] as const;

const retryAdminSummary = createTransientRetry(ADMIN_SUMMARY_RETRY_COUNT);
const numberFormatter = new Intl.NumberFormat("id-ID");
const dateTimeFormatter = new Intl.DateTimeFormat("id-ID", {
  timeZone: DASHBOARD_TIME_ZONE,
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export type AdminDashboardPresenter = {
  isLoading: boolean;
  isError: boolean;
  retry: () => Promise<void>;
  updatedAtLabel?: string | undefined;
  stats: readonly AdminStatCardProps[];
  roleRows: readonly AdminRoleBreakdownRow[];
};

// Dirakit dari komponen tanggal agar hasilnya sama di setiap versi ICU: "30 Okt 2026, 09.15".
function formatDashboardDateTime(date: Date): string | undefined {
  if (Number.isNaN(date.getTime())) return undefined;

  const parts = new Map<string, string>();
  for (const part of dateTimeFormatter.formatToParts(date)) {
    parts.set(part.type, part.value);
  }
  const read = (type: string): string => parts.get(type) ?? "";

  return `${read("day")} ${read("month")} ${read("year")}, ${read("hour")}.${read("minute")}`;
}

function downloadCaption(latestDownloadAt: string | null): string | undefined {
  if (latestDownloadAt === null) return NO_DOWNLOAD_CAPTION;

  const formatted = formatDashboardDateTime(new Date(latestDownloadAt));
  return formatted ? `Terakhir diunduh ${formatted}` : undefined;
}

function totalUsers(usersByRole: AdminSummary["usersByRole"]): number {
  return usersByRole.member_team + usersByRole.head_of_team + usersByRole.admin;
}

function buildStats(summary: AdminSummary): AdminStatCardProps[] {
  const { member_team: members, head_of_team: heads, admin: admins } = summary.usersByRole;

  return [
    {
      id: "admin-total-users",
      label: "Total Pengguna",
      value: numberFormatter.format(totalUsers(summary.usersByRole)),
      caption: `${numberFormatter.format(members)} Member · ${numberFormatter.format(heads)} Head · ${numberFormatter.format(admins)} Admin`,
    },
    {
      id: "admin-total-documents",
      label: "Total Dokumen",
      value: numberFormatter.format(summary.totalDocuments),
      caption: TOTAL_DOCUMENTS_CAPTION,
    },
    {
      id: "admin-uploaded-7-days",
      label: "Unggahan 7 Hari",
      value: numberFormatter.format(summary.uploadedLast7Days),
    },
    {
      id: "admin-total-downloads",
      label: "Total Unduhan",
      value: numberFormatter.format(summary.downloadCount),
      caption: downloadCaption(summary.latestDownloadAt),
    },
  ];
}

function buildRoleRows(usersByRole: AdminSummary["usersByRole"]): AdminRoleBreakdownRow[] {
  const total = totalUsers(usersByRole);

  return ROLE_ROWS.map((role) => {
    const count = usersByRole[role.id];
    return {
      id: role.id,
      label: role.label,
      countLabel: numberFormatter.format(count),
      widthPercent: total === 0 ? 0 : (count / total) * FULL_BAR_PERCENT,
    };
  });
}

export function useAdminDashboardPresenter(): AdminDashboardPresenter {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ADMIN_SUMMARY_QUERY_KEY,
    queryFn: getAdminSummary,
    staleTime: ADMIN_SUMMARY_STALE_TIME_MS,
    retry: retryAdminSummary,
  });

  const retry = useCallback(async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: ADMIN_SUMMARY_QUERY_KEY });
  }, [queryClient]);

  const summary = query.data;

  return {
    isLoading: query.isLoading,
    isError: query.isError,
    retry,
    // Waktu data terakhir diambil di browser; kontrak tidak punya timestamp dari server.
    updatedAtLabel:
      summary && query.dataUpdatedAt > 0
        ? formatDashboardDateTime(new Date(query.dataUpdatedAt))
        : undefined,
    stats: summary ? buildStats(summary) : [],
    roleRows: summary ? buildRoleRows(summary.usersByRole) : [],
  };
}
