import type React from "react";
import { createContext, useContext } from "react";
import {
  useAuthSessionPresenter,
  type AuthSessionPresenter,
  type AuthSessionPresenterOptions,
} from "./auth-session.presenter";

export type AuthSessionContextValue = AuthSessionPresenter;

const AuthSessionContext = createContext<AuthSessionContextValue | null>(null);

export type AuthSessionProviderProps = AuthSessionPresenterOptions & {
  children?: React.ReactNode;
};

export function AuthSessionProvider({
  children,
  ...options
}: AuthSessionProviderProps): React.JSX.Element {
  const value = useAuthSessionPresenter(options);
  return <AuthSessionContext.Provider value={value}>{children}</AuthSessionContext.Provider>;
}

export function useOptionalAuthSession(): AuthSessionContextValue | null {
  return useContext(AuthSessionContext);
}

export function useAuthSession(): AuthSessionContextValue {
  const context = useContext(AuthSessionContext);
  if (!context) {
    throw new Error("useAuthSession must be used within an AuthSessionProvider");
  }
  return context;
}
