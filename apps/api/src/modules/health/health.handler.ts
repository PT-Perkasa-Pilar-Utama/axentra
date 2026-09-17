import type { Context } from "hono";
import type { ApiEnvironment } from "../../environment";
import type { DependencyCheck } from "./health.service";
import type { LivenessData } from "@axentra/shared";
import { jsonSuccess } from "../../http/responses";
import { evaluateReadiness } from "./health.service";

export type HealthHandlerDependencies = {
  service: string;
  version: string;
  readinessChecks: ReadonlyArray<DependencyCheck>;
};

export function createLivenessHandler(dependencies: HealthHandlerDependencies) {
  return (context: Context<ApiEnvironment>): Response => {
    const data: LivenessData = {
      status: "ok",
      service: dependencies.service,
      version: dependencies.version,
    };
    return jsonSuccess(context, data);
  };
}

export function createReadinessHandler(dependencies: HealthHandlerDependencies) {
  return async (context: Context<ApiEnvironment>): Promise<Response> => {
    const result = await evaluateReadiness(
      dependencies.service,
      dependencies.version,
      dependencies.readinessChecks,
    );
    return jsonSuccess(context, result.data, result.ready ? 200 : 503);
  };
}
