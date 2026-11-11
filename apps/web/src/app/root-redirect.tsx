import type React from "react";
import { Navigate } from "react-router";
import { useAuthSession } from "../features/auth/auth-session.context";
import { resolvePostLoginPath } from "./post-login-path";

/**
 * Halaman utama tidak punya isi sendiri. Route ini dipasang di dalam ProtectedRoute,
 * jadi pengguna yang belum login sudah diarahkan ke /login sebelum komponen ini dirender.
 * Pengguna yang sudah login diarahkan ke dasbor sesuai role-nya.
 */
export function RootRedirect(): React.JSX.Element {
  const { user } = useAuthSession();
  return <Navigate to={resolvePostLoginPath(user?.role, undefined)} replace />;
}
