import type { Context } from "hono";
import { searchDocumentsQuerySchema } from "@axentra/shared";
import type { ApiEnvironment } from "../../environment";
import { ValidationError } from "../../http/errors";
import { jsonSuccess } from "../../http/responses";
import type { SearchService } from "./search.service";

export type SearchHandlerDependencies = {
  searchService: SearchService;
};

export function createSearchDocumentsHandler(
  dependencies: SearchHandlerDependencies,
): (context: Context<ApiEnvironment>) => Promise<Response> {
  return async (context: Context<ApiEnvironment>): Promise<Response> => {
    const rawTags =
      context.req.queries("tags") ?? context.req.query("tags") ?? context.req.query("tag");

    const parsed = searchDocumentsQuerySchema.safeParse({
      q: context.req.query("q") ?? context.req.query("keyword"),
      tags: rawTags,
      categoryId: context.req.query("categoryId"),
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

    const result = await dependencies.searchService.searchDocuments(parsed.data);
    return jsonSuccess(context, result.items, 200, result.meta);
  };
}
