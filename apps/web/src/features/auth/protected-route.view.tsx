import type React from "react";
import { Navigate, Outlet, useLocation } from "react-router";
import type { UserRole } from "@axentra/shared";
import { useAuthSession } from "./auth-session.context";

export type ProtectedRouteProps = {
  allowedRoles?: UserRole[];
  children?: React.ReactNode;
};

export function ProtectedRoute({ allowedRoles, children }: ProtectedRouteProps): React.JSX.Element {
  const { isAuthenticated, isLoading, user } = useAuthSession();
  const location = useLocation();

  if (isLoading) {
    return (
      <div
        className="flex min-h-[50vh] items-center justify-center p-8"
        role="status"
        aria-live="polite"
      >
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-[#214e30]" />
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Memuat sesi...
          </span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center px-4 py-12">
        <div
          role="alert"
          className="w-full max-w-md rounded-xl border border-amber-200 bg-amber-50 p-6 text-center shadow-sm"
        >
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-700">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h2 className="text-base font-bold text-slate-800">Akses Dibatasi</h2>
          <p className="mt-1 text-xs text-slate-600">
            Anda tidak memiliki izin yang sesuai untuk mengakses halaman ini.
          </p>
        </div>
      </main>
    );
  }

  if (children) {
    return <>{children}</>;
  }

  return <Outlet />;
}
