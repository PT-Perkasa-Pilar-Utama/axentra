import { NavLink } from "react-router";
import type React from "react";

import perkasaLogo from "../assets/perkasa-logo-sidebar.png";
import { UserSessionBadge } from "../features/auth/user-session-badge.view";
import { SHELL_ICONS } from "./app-shell-icons";
import { ROLE_MENU, type ShellRole } from "./app-shell.menu";

const DOCUMENT_TITLE_SUFFIX = "Axentra";

export type AppShellProps = {
  role: ShellRole;
  title: string;
  subtitle?: string | undefined;
  /** Konten kanan header, misalnya pencarian. */
  actions?: React.ReactNode;
  /** Slot sidebar khusus role, misalnya CategoryNavigationView. */
  sidebarExtras?: React.ReactNode;
  /** Kelas tambahan pada elemen <main>. */
  className?: string | undefined;
  /** data-testid pada pembungkus konten halaman. Elemen <main> selalu `app-shell`. */
  testId?: string | undefined;
  children: React.ReactNode;
};

const SHELL_BASE_CLASS = "app-shell min-h-[100dvh] bg-[#f0f2f4] text-[#252930]";

export function AppShell({
  role,
  title,
  subtitle,
  actions,
  sidebarExtras,
  className,
  testId,
  children,
}: AppShellProps): React.JSX.Element {
  const menu = ROLE_MENU[role];

  return (
    <main
      className={className ? `${className} ${SHELL_BASE_CLASS}` : SHELL_BASE_CLASS}
      data-testid="app-shell"
    >
      <title>{`${title} | ${DOCUMENT_TITLE_SUFFIX}`}</title>
      <div className="grid min-h-[100dvh] grid-cols-1 md:grid-cols-[18.75rem_minmax(0,1fr)]">
        {/* Dari md ke atas sidebar setinggi layar: menu dan kategori scroll di dalamnya,
            badge sesi tetap terlihat di dasar. */}
        <aside className="dashboard-sidebar flex flex-col justify-between">
          <div className="flex min-h-0 flex-col gap-4 md:flex-1 md:overflow-y-auto">
            <div className="dashboard-sidebar-brand">
              <img src={perkasaLogo} alt="PERKASA" className="dashboard-sidebar-logo" />
            </div>
            <nav aria-label="Navigasi utama" className="flex flex-col gap-1">
              {menu.map((entry) => {
                const Icon = SHELL_ICONS[entry.icon];
                return (
                  <NavLink
                    key={entry.to}
                    id={entry.id}
                    to={entry.to}
                    className={({ isActive }) =>
                      isActive ? "dashboard-sidebar-link is-active" : "dashboard-sidebar-link"
                    }
                  >
                    <Icon />
                    <span>{entry.label}</span>
                  </NavLink>
                );
              })}
            </nav>
            {sidebarExtras}
          </div>
          <div className="shrink-0 border-t border-[var(--sidebar-divider,#454a52)] pt-4">
            <UserSessionBadge />
          </div>
        </aside>

        <div className="min-w-0 px-4 sm:px-6 md:px-4" data-testid={testId}>
          <header className="flex min-h-[4.5rem] items-center justify-between gap-4 py-4">
            <div className="min-w-0">
              <h1 className="text-lg font-semibold leading-none">{title}</h1>
              {subtitle && <p className="mt-1.5 text-sm text-[#5b626b]">{subtitle}</p>}
            </div>
            {actions}
          </header>

          <div className="space-y-6 pb-8">{children}</div>
        </div>
      </div>
    </main>
  );
}
