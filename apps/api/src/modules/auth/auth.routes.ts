import { Hono } from "hono";
import type { ApiEnvironment } from "../../environment";
import type { TokenVerifier } from "../../middleware/auth";
import { requireAuth } from "../../middleware/auth";
import {
  createLoginHandler,
  createLogoutHandler,
  createMeHandler,
  createRefreshHandler,
} from "./auth.handler";
import type { AuthService } from "./auth.service";
import { createAuthService } from "./auth.service";

export type AuthRoutesDependencies = {
  tokenVerifier?: TokenVerifier | undefined;
  authService?: AuthService | undefined;
};

export function createAuthRoutes(dependencies?: AuthRoutesDependencies): Hono<ApiEnvironment> {
  const service = dependencies?.authService ?? createAuthService();
  const verifier = dependencies?.tokenVerifier ?? service.tokenVerifier;
  const routes = new Hono<ApiEnvironment>();

  routes.post("/login", createLoginHandler(service));
  routes.get("/me", requireAuth(verifier), createMeHandler());
  routes.post("/refresh", createRefreshHandler(service));
  routes.post("/logout", requireAuth(verifier), createLogoutHandler(service));

  return routes;
}
