import type { Context } from "hono";
import { categoriesQuerySchema } from "@axentra/shared";
import type { ApiEnvironment } from "../../environment";
import { ValidationError } from "../../http/errors";
import { jsonSuccess } from "../../http/responses";
import type { CategoriesService } from "./categories.service";

export type CategoriesHandlerDependencies = {
  categoriesService: CategoriesService;
};

export function createListCategoriesHandler(
  dependencies: CategoriesHandlerDependencies,
): (context: Context<ApiEnvironment>) => Promise<Response> {
  return async (context: Context<ApiEnvironment>): Promise<Response> => {
    const rawLimit = context.req.query("limit");
    const parsed = categoriesQuerySchema.safeParse({
      limit: rawLimit === undefined ? undefined : rawLimit,
    });

    if (!parsed.success) {
      const details = parsed.error.issues.map((issue) => ({
        field: issue.path.join(".") || "query",
        message: issue.message,
      }));
      throw new ValidationError("Data tidak valid", details);
    }

    const list = await dependencies.categoriesService.listCategories(parsed.data.limit);
    return jsonSuccess(context, list, 200);
  };
}
