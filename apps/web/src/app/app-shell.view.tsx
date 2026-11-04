import type React from "react";
import { NavLink } from "react-router";
import perkasaLogo from "../assets/perkasa-logo-sidebar.png";
import { useAuthSession } from "../features/auth/auth-session.context";
import { UserSessionBadge } from "../features/auth/user-session-badge.view";

export type AppShellProps = {
  children: React.ReactNode;
  roleExtras?: React.ReactNode;
};

function HomeIcon(): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      aria-hidden="true"
    >
      <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-6v-7h-4v7H4a1 1 0 0 1-1-1z" />
    </svg>
  );
}

function AuditIcon(): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function PermissionsIcon(): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      aria-hidden="true"
    >
      <line x1="4" y1="21" x2="4" y2="14" />
      <line x1="4" y1="10" x2="4" y2="3" />
      <line x1="12" y1="21" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12" y2="3" />
      <line x1="20" y1="21" x2="20" y2="16" />
      <line x1="20" y1="12" x2="20" y2="3" />
      <line x1="1" y1="14" x2="7" y2="14" />
      <line x1="9" y1="8" x2="15" y2="8" />
      <line x1="17" y1="16" x2="23" y2="16" />
    </svg>
  );
}

export function AppShell({ children, roleExtras }: AppShellProps): React.JSX.Element {
  const { user } = useAuthSession();
  const isHeadOfTeam = user?.role === "head_of_team";

  return (
    <main className="app-shell min-h-[100dvh] bg-[#f0f2f4] text-[#252930]" data-testid="app-shell">
      <div className="grid min-h-[100dvh] grid-cols-1 md:grid-cols-[18.75rem_minmax(0,1fr)]">
        <aside className="dashboard-sidebar flex h-full flex-col justify-between">
          <div className="flex flex-col gap-4">
            <div className="dashboard-sidebar-brand">
              <img src={perkasaLogo} alt="PERKASA" className="dashboard-sidebar-logo" />
            </div>
            <nav aria-label="Navigasi utama" className="flex flex-col gap-1">
              <NavLink
                id="dashboard-home-link"
                to="/dashboard"
                className={({ isActive }) =>
                  `dashboard-sidebar-link ${isActive ? "is-active" : ""}`
                }
              >
                <HomeIcon />
                <span>Dashboard</span>
              </NavLink>
              {isHeadOfTeam && (
                <>
                  <NavLink
                    id="dashboard-audit-trail-link"
                    to="/audit-trail"
                    className={({ isActive }) =>
                      `dashboard-sidebar-link ${isActive ? "is-active" : ""}`
                    }
                  >
                    <AuditIcon />
                    <span>Auditrail</span>
                  </NavLink>
                  <NavLink
                    id="dashboard-permissions-link"
                    to="/permission-categories"
                    className={({ isActive }) =>
                      `dashboard-sidebar-link ${isActive ? "is-active" : ""}`
                    }
                  >
                    <PermissionsIcon />
                    <span>Permission category</span>
                  </NavLink>
                </>
              )}
            </nav>
            {roleExtras}
          </div>
          <div className="border-t border-[var(--sidebar-divider,#454a52)] pt-4">
            <UserSessionBadge />
          </div>
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </main>
  );
}
