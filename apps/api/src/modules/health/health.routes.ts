import { Hono } from "hono";
import type { ApiEnvironment } from "../../environment";
import type { HealthHandlerDependencies } from "./health.handler";
import { createLivenessHandler, createReadinessHandler } from "./health.handler";

export function createHealthRoutes(dependencies: HealthHandlerDependencies): Hono<ApiEnvironment> {
  const routes = new Hono<ApiEnvironment>();
  routes.get("/", createLivenessHandler(dependencies));
  routes.get("/ready", createReadinessHandler(dependencies));
  return routes;
}
