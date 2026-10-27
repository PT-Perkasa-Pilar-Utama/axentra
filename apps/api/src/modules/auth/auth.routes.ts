import { Hono } from "hono";
import type { ApiConfig } from "@axentra/config";
import type { ApiEnvironment } from "../../environment";
import type { TokenVerifier } from "../../middleware/auth";
import { requireAuth } from "../../middleware/auth";
import type { RefreshCookieSettings } from "./auth.cookie";
import {
  createLoginHandler,
  createLogoutHandler,
  createMeHandler,
  createRefreshHandler,
} from "./auth.handler";
import type { AuthService } from "./auth.service";
import { createUnconfiguredAuthService } from "./auth.service";

export type AuthRoutesDependencies = {
  tokenVerifier?: TokenVerifier | undefined;
  authService?: AuthService | undefined;
  appEnvironment?: ApiConfig["APP_ENV"] | undefined;
};

export function createAuthRoutes(dependencies?: AuthRoutesDependencies): Hono<ApiEnvironment> {
  const service = dependencies?.authService ?? createUnconfiguredAuthService();
  const verifier = dependencies?.tokenVerifier ?? service.tokenVerifier;
  // The refresh cookie is Secure only in production, where the API is served over HTTPS.
  const cookies: RefreshCookieSettings = { secure: dependencies?.appEnvironment === "production" };
  const routes = new Hono<ApiEnvironment>();

  routes.post("/login", createLoginHandler(service, cookies));
  routes.get("/me", requireAuth(verifier), createMeHandler());
  routes.post("/refresh", createRefreshHandler(service, cookies));
  routes.post("/logout", createLogoutHandler(service, cookies));

  return routes;
}
