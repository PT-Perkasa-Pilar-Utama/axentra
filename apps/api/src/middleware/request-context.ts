import { createMiddleware } from "hono/factory";
import type { MiddlewareHandler } from "hono";
import type { Logger } from "@axentra/observability";
import type { ApiEnvironment } from "../environment";
import { requestLogger } from "@axentra/observability";

export function requestContextMiddleware(baseLogger: Logger): MiddlewareHandler<ApiEnvironment> {
  return createMiddleware<ApiEnvironment>(async (context, next) => {
    const providedRequestId = context.req.header("x-request-id")?.trim();
    const requestId =
      providedRequestId === "" || providedRequestId === undefined
        ? crypto.randomUUID()
        : providedRequestId;
    const logger = requestLogger(baseLogger, requestId);
    const startedAt = performance.now();

    context.set("requestId", requestId);
    context.set("logger", logger);
    context.header("x-request-id", requestId);

    await next();

    logger.info(
      {
        method: context.req.method,
        path: context.req.path,
        status: context.res.status,
        durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
      },
      "request completed",
    );
  });
}
