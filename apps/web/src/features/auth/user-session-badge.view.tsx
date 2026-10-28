import type React from "react";
import { useUserSessionBadgePresenter } from "./user-session-badge.presenter";

export function UserSessionBadge(): React.JSX.Element | null {
  const presenter = useUserSessionBadgePresenter();
  if (presenter === null) return null;

  return (
    <div className="flex flex-col gap-1.5 sm:items-end">
      <div
        data-testid="user-session-badge"
        className="inline-flex items-center gap-2.5 rounded-full border border-slate-200/90 bg-white/90 py-1 pl-1.5 pr-2.5 shadow-sm backdrop-blur-xs transition-colors"
      >
        <div
          className="flex h-7 w-7 items-center justify-center rounded-full bg-[#214e30] text-xs font-bold text-white select-none"
          aria-hidden="true"
        >
          {presenter.initials}
        </div>

        <div className="flex flex-col text-left leading-tight">
          <span className="text-xs font-bold text-slate-800 truncate max-w-[120px] sm:max-w-[160px]">
            {presenter.displayName}
          </span>
          <span className="text-[10px] font-semibold text-emerald-800 tracking-wide">
            {presenter.roleLabel}
          </span>
        </div>

        <div className="h-4 w-[1px] bg-slate-200 mx-0.5" aria-hidden="true" />

        <button
          type="button"
          onClick={() => void presenter.handleLogout()}
          disabled={presenter.isLoggingOut}
          aria-label="Keluar dari akun"
          className="cursor-pointer text-xs font-semibold text-slate-500 hover:text-red-700 transition-colors disabled:opacity-50 focus:outline-none focus-visible:underline"
        >
          {presenter.logoutLabel}
        </button>
      </div>

      {presenter.logoutError !== null && (
        <p
          role="alert"
          className="flex max-w-xs flex-wrap items-center gap-x-2 text-xs text-rose-700 sm:justify-end sm:text-right"
        >
          <span>{presenter.logoutError}</span>
          <button
            type="button"
            onClick={() => void presenter.handleLogout()}
            className="cursor-pointer font-semibold underline hover:text-rose-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
          >
            Coba lagi
          </button>
        </p>
      )}
    </div>
  );
}
