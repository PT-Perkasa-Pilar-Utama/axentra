import type { Context } from "hono";
import type { ApiEnvironment } from "../../environment";
import { jsonSuccess } from "../../http/responses";
import type { CategoriesService } from "./categories.service";

export type CategoriesHandlerDependencies = {
  categoriesService: CategoriesService;
};

export function createListCategoriesHandler(
  dependencies: CategoriesHandlerDependencies,
): (context: Context<ApiEnvironment>) => Promise<Response> {
  return async (context: Context<ApiEnvironment>): Promise<Response> => {
    const list = await dependencies.categoriesService.listCategories();
    return jsonSuccess(context, list, 200);
  };
}
