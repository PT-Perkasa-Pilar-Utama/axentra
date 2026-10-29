import type React from "react";
import { useAuthSession } from "./auth-session.context";
import { SessionLoadingView } from "./session-loading.view";

export type SessionBootstrapGateProps = {
  children: React.ReactNode;
};

/**
 * Menahan seluruh router (termasuk halaman login) sampai bootstrap sesi selesai,
 * sehingga tidak ada kilatan halaman login saat sesi masih bisa dipulihkan.
 */
export function SessionBootstrapGate({ children }: SessionBootstrapGateProps): React.JSX.Element {
  const { isLoading } = useAuthSession();
  if (isLoading) {
    return <SessionLoadingView />;
  }
  return <>{children}</>;
}
