import { useCallback, useState } from "react";
import { useNavigate } from "react-router";
import type { AuthUser, UserRole } from "@axentra/shared";
import { useOptionalAuthSession } from "./auth-session.context";

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  member_team: "Anggota Tim",
  head_of_team: "Ketua Tim",
  admin: "Administrator",
};

export const LOGOUT_FAILED_MESSAGE =
  "Gagal keluar dari akun. Sesi Anda mungkin masih aktif di server. Coba lagi.";

export type UserSessionBadgePresenter = {
  displayName: string;
  initials: string;
  roleLabel: string;
  isLoggingOut: boolean;
  logoutLabel: string;
  /** Terisi saat logout gagal; sesi lokal tetap aktif dan tombol coba lagi tersedia. */
  logoutError: string | null;
  handleLogout: () => Promise<void>;
};

function deriveInitials(displayName: string): string {
  const initials = displayName
    .split(/[\s@._]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  return initials || "U";
}

function toDisplayName(user: AuthUser): string {
  return user.name || user.email;
}

/** null saat tidak ada sesi aktif, sehingga badge tidak ditampilkan. */
export function useUserSessionBadgePresenter(): UserSessionBadgePresenter | null {
  const sessionContext = useOptionalAuthSession();
  const navigate = useNavigate();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const logoutSession = sessionContext?.logoutSession;

  const handleLogout = useCallback(async (): Promise<void> => {
    if (!logoutSession) return;
    setIsLoggingOut(true);
    setLogoutError(null);
    try {
      // Hanya logout yang dikonfirmasi server yang menghapus sesi dan membuka halaman login.
      if (await logoutSession()) {
        void navigate("/login");
      } else {
        setLogoutError(LOGOUT_FAILED_MESSAGE);
      }
    } finally {
      setIsLoggingOut(false);
    }
  }, [logoutSession, navigate]);

  if (!sessionContext?.isAuthenticated || !sessionContext.user) return null;

  const { user } = sessionContext;
  const displayName = toDisplayName(user);
  return {
    displayName,
    initials: deriveInitials(displayName),
    roleLabel: USER_ROLE_LABELS[user.role] ?? user.role,
    isLoggingOut,
    logoutLabel: isLoggingOut ? "..." : "Keluar",
    logoutError,
    handleLogout,
  };
}
