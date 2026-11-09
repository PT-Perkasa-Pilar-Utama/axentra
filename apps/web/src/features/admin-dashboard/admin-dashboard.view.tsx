import { Link } from "react-router";
import type React from "react";

import type { AdminDashboardPresenter } from "./admin-dashboard.presenter";
import { AdminRoleBreakdown } from "./admin-role-breakdown.view";
import { AdminStatCard } from "./admin-stat-card.view";

export const ADMIN_DASHBOARD_PAGE_TITLE = "Dashboard";
export const ADMIN_DASHBOARD_SUBTITLE = "Ringkasan aktivitas sistem Axentra";

const ADMIN_SKELETON_CARD_IDS = ["users", "documents", "uploads", "downloads"] as const;

export type AdminDashboardViewProps = {
  presenter: AdminDashboardPresenter;
  manageAccountsHref: string;
};

export function AdminDashboardView({
  presenter,
  manageAccountsHref,
}: AdminDashboardViewProps): React.JSX.Element {
  if (presenter.isLoading) {
    return (
      <div
        aria-busy="true"
        aria-label="Memuat data dasbor admin"
        className="space-y-4"
        role="status"
      >
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {ADMIN_SKELETON_CARD_IDS.map((id) => (
            <div key={id} className="h-28 rounded-2xl bg-[#e6e9ec] motion-safe:animate-pulse" />
          ))}
        </div>
        <div className="h-56 rounded-2xl bg-[#e6e9ec] motion-safe:animate-pulse lg:w-1/2" />
      </div>
    );
  }

  if (presenter.isError) {
    return (
      <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-6">
        <p className="text-sm text-red-800">Data dasbor gagal dimuat.</p>
        <button
          type="button"
          onClick={() => void presenter.retry()}
          className="mt-4 rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white"
        >
          Coba lagi
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {presenter.stats.map((stat) => (
          <AdminStatCard
            key={stat.id}
            id={stat.id}
            label={stat.label}
            value={stat.value}
            caption={stat.caption}
          />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <AdminRoleBreakdown
          title="Pengguna per Peran"
          description="Akun aktif dan nonaktif"
          rows={presenter.roleRows}
          footer={
            <Link to={manageAccountsHref} className="font-semibold text-[#3f7a2a] hover:underline">
              Kelola akun →
            </Link>
          }
        />
      </div>
    </div>
  );
}
