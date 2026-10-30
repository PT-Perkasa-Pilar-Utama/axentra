import type { Context } from "hono";
import type { ApiEnvironment } from "../../environment";
import { ValidationError } from "../../http/errors";
import { jsonSuccess } from "../../http/responses";
import { downloadAuditListQuerySchema } from "./audit.schema";
import type { IAuditService } from "./audit.service";

export type AuditHandlerDependencies = {
  auditService: IAuditService;
};

export function createListDownloadAuditEventsHandler(
  dependencies: AuditHandlerDependencies,
): (context: Context<ApiEnvironment>) => Promise<Response> {
  return async (context: Context<ApiEnvironment>): Promise<Response> => {
    const parsed = downloadAuditListQuerySchema.safeParse({
      page: context.req.query("page"),
      limit: context.req.query("limit"),
    });

    if (!parsed.success) {
      const details = parsed.error.issues.map((issue) => ({
        field: issue.path.join(".") || "query",
        message: issue.message,
      }));
      throw new ValidationError("Data tidak valid", details);
    }

    const result = await dependencies.auditService.listDownloadAuditEvents(parsed.data);
    return jsonSuccess(context, result.items, 200, result.meta);
  };
}
