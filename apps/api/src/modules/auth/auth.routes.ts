import { Hono } from "hono";
import type { ApiEnvironment } from "../../environment";
import { authMiddleware } from "../../middleware/auth";
import {
  createLoginHandler,
  createLogoutHandler,
  createMeHandler,
  createRefreshHandler,
} from "./auth.handler";
import type { AuthService } from "./auth.service";
import { createAuthService } from "./auth.service";

export type AuthRoutesDependencies = {
  authService?: AuthService;
};

export function createAuthRoutes(dependencies?: AuthRoutesDependencies): Hono<ApiEnvironment> {
  const service = dependencies?.authService ?? createAuthService();
  const routes = new Hono<ApiEnvironment>();

  routes.post("/login", createLoginHandler(service));
  routes.get("/me", authMiddleware(), createMeHandler());
  routes.post("/refresh", authMiddleware(), createRefreshHandler(service));
  routes.post("/logout", authMiddleware(), createLogoutHandler(service));

  return routes;
}
