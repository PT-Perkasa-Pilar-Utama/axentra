import type React from "react";
import { useState } from "react";
import { useNavigate } from "react-router";
import type { UserRole } from "@axentra/shared";
import { useOptionalAuthSession } from "./auth-session.context";

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  member_team: "Anggota Tim",
  head_of_team: "Ketua Tim",
  admin: "Administrator",
};

export function UserSessionBadge(): React.JSX.Element | null {
  const sessionContext = useOptionalAuthSession();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const navigate = useNavigate();

  if (!sessionContext?.isAuthenticated || !sessionContext.user) return null;

  const { user, logoutSession } = sessionContext;
  const roleLabel = USER_ROLE_LABELS[user.role] ?? user.role;
  const userInitials = (user.name || user.email)
    .split(/[\s@._]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");

  const handleLogout = async (): Promise<void> => {
    setIsLoggingOut(true);
    try {
      await logoutSession();
      void navigate("/login");
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <div
      data-testid="user-session-badge"
      className="inline-flex items-center gap-2.5 rounded-full border border-slate-200/90 bg-white/90 py-1 pl-1.5 pr-2.5 shadow-sm backdrop-blur-xs transition-colors"
    >
      <div
        className="flex h-7 w-7 items-center justify-center rounded-full bg-[#214e30] text-xs font-bold text-white select-none"
        aria-hidden="true"
      >
        {userInitials || "U"}
      </div>

      <div className="flex flex-col text-left leading-tight">
        <span className="text-xs font-bold text-slate-800 truncate max-w-[120px] sm:max-w-[160px]">
          {user.name || user.email}
        </span>
        <span className="text-[10px] font-semibold text-emerald-800 tracking-wide">
          {roleLabel}
        </span>
      </div>

      <div className="h-4 w-[1px] bg-slate-200 mx-0.5" aria-hidden="true" />

      <button
        type="button"
        onClick={() => void handleLogout()}
        disabled={isLoggingOut}
        aria-label="Keluar dari akun"
        className="cursor-pointer text-xs font-semibold text-slate-500 hover:text-red-700 transition-colors disabled:opacity-50 focus:outline-none focus-visible:underline"
      >
        {isLoggingOut ? "..." : "Keluar"}
      </button>
    </div>
  );
}
