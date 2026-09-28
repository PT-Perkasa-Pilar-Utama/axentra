import type { Context } from "hono";
import { topTagsQuerySchema } from "@axentra/shared";
import type { ApiEnvironment } from "../../environment";
import { ValidationError } from "../../http/errors";
import { jsonSuccess } from "../../http/responses";
import type { TopTagsService } from "./tags.service";

export type TopTagsHandlerDependencies = {
  service: TopTagsService;
};

export function createListTopTagsHandler(
  dependencies: TopTagsHandlerDependencies,
): (context: Context<ApiEnvironment>) => Promise<Response> {
  return async (context: Context<ApiEnvironment>): Promise<Response> => {
    const parsed = topTagsQuerySchema.safeParse({
      context: context.req.query("context"),
      limit: context.req.query("limit"),
      documentIds: context.req.queries("documentIds"),
    });

    if (!parsed.success) {
      const details = parsed.error.issues.map((issue) => ({
        field: issue.path.join(".") || "query",
        message: issue.message,
      }));
      throw new ValidationError("Data tidak valid", details);
    }

    const tags = await dependencies.service.listTopTags(parsed.data);
    return jsonSuccess(context, tags);
  };
}
