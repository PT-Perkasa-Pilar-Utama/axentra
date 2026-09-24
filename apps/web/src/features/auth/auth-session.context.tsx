import type React from "react";
import { createContext, useContext, useEffect, useState, useCallback } from "react";
import type { AuthUser, LoginResponse } from "@axentra/shared";
import { setAuthTokenGetter, setUnauthorizedHandler } from "../../lib/api-client";
import {
  clearSession,
  getAuthToken,
  loadSession,
  saveSession,
  type AuthSession,
} from "./session.storage";
import { getAuthMe, logout as defaultLogoutApi } from "./login.api";

export type AuthSessionContextValue = {
  session: AuthSession | null;
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  loginSession: (response: LoginResponse, rememberMe: boolean) => void;
  logoutSession: () => Promise<void>;
  refreshProfile: () => Promise<AuthUser | null>;
};

const AuthSessionContext = createContext<AuthSessionContextValue | null>(null);

export function createUnauthorizedHandler(
  onUnauthorized?: (currentPath?: string) => void,
): () => void {
  return () => {
    clearSession();
    const currentPath =
      typeof window !== "undefined" ? window.location.pathname + window.location.search : "/";

    if (onUnauthorized) {
      onUnauthorized(currentPath);
    } else if (typeof window !== "undefined" && window.location.pathname !== "/login") {
      const target = `/login?from=${encodeURIComponent(currentPath)}`;
      if (window.location.assign) {
        window.location.assign(target);
      } else {
        window.location.href = target;
      }
    }
  };
}

export type AuthSessionProviderProps = {
  children?: React.ReactNode;
  initialSession?: AuthSession | null;
  logoutApiFn?: () => Promise<{ message: string }>;
  getMeApiFn?: () => Promise<AuthUser>;
  onUnauthorized?: (currentPath?: string) => void;
};

export function AuthSessionProvider({
  children,
  initialSession,
  logoutApiFn = defaultLogoutApi,
  getMeApiFn = getAuthMe,
  onUnauthorized,
}: AuthSessionProviderProps): React.JSX.Element {
  const [session, setSession] = useState<AuthSession | null>(() => {
    if (initialSession !== undefined) return initialSession;
    return loadSession();
  });
  const [isLoading, setIsLoading] = useState(false);

  const handleUnauthorized = useCallback((): void => {
    setSession(null);
    createUnauthorizedHandler(onUnauthorized)();
  }, [onUnauthorized]);

  useEffect(() => {
    setAuthTokenGetter(getAuthToken);
    setUnauthorizedHandler(handleUnauthorized);

    return () => {
      setAuthTokenGetter(null);
      setUnauthorizedHandler(null);
    };
  }, [handleUnauthorized]);

  const loginSession = useCallback((response: LoginResponse, rememberMe: boolean): void => {
    const newSession: AuthSession = {
      user: response.user,
      token: response.token,
      refreshToken: response.refreshToken,
      rememberMe,
    };
    saveSession(newSession);
    setSession(newSession);
  }, []);

  const logoutSession = useCallback(async (): Promise<void> => {
    try {
      await logoutApiFn();
    } catch {
      // Proceed to clear local state even if remote logout fails
    } finally {
      clearSession();
      setSession(null);
    }
  }, [logoutApiFn]);

  const refreshProfile = useCallback(async (): Promise<AuthUser | null> => {
    if (!session?.token) return null;
    setIsLoading(true);
    try {
      const updatedUser = await getMeApiFn();
      const updatedSession: AuthSession = {
        ...session,
        user: updatedUser,
      };
      saveSession(updatedSession);
      setSession(updatedSession);
      setIsLoading(false);
      return updatedUser;
    } catch {
      setIsLoading(false);
      return null;
    }
  }, [session, getMeApiFn]);

  const value: AuthSessionContextValue = {
    session,
    user: session ? session.user : null,
    isAuthenticated: Boolean(session?.token),
    isLoading,
    loginSession,
    logoutSession,
    refreshProfile,
  };

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
