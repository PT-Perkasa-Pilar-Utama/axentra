import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { ApiEnvironment } from "../../environment";
import { REMEMBER_ME_REFRESH_TTL_MS } from "./auth.policy";

export const REFRESH_COOKIE_NAME = "axentra_refresh";
// Covers /auth/refresh and /auth/logout, the two endpoints that read the refresh cookie.
export const REFRESH_COOKIE_PATH = "/api/v1/auth";

export type RefreshCookieSettings = {
  secure: boolean;
};

export function readRefreshCookie(context: Context<ApiEnvironment>): string | undefined {
  return getCookie(context, REFRESH_COOKIE_NAME);
}

// A browser-session cookie (no Max-Age) unless the user chose remember_me.
export function writeRefreshCookie(
  context: Context<ApiEnvironment>,
  refreshToken: string,
  rememberMe: boolean,
  settings: RefreshCookieSettings,
): void {
  setCookie(context, REFRESH_COOKIE_NAME, refreshToken, {
    path: REFRESH_COOKIE_PATH,
    httpOnly: true,
    sameSite: "Lax",
    secure: settings.secure,
    ...(rememberMe ? { maxAge: REMEMBER_ME_REFRESH_TTL_MS / 1000 } : {}),
  });
}

export function clearRefreshCookie(
  context: Context<ApiEnvironment>,
  settings: RefreshCookieSettings,
): void {
  deleteCookie(context, REFRESH_COOKIE_NAME, {
    path: REFRESH_COOKIE_PATH,
    httpOnly: true,
    sameSite: "Lax",
    secure: settings.secure,
  });
}
