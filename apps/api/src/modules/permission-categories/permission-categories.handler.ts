import type { Context } from "hono";
import type { ApiEnvironment } from "../../environment";
import { ValidationError } from "../../http/errors";
import { jsonSuccess } from "../../http/responses";
import {
  permissionCategoriesQuerySchema,
  permissionCategoryIdParamSchema,
  updatePermissionCategoryRequestSchema,
} from "./permission-categories.schema";
import type { IPermissionCategoriesService } from "./permission-categories.service";

export type PermissionCategoriesHandlerDependencies = {
  permissionCategoriesService: IPermissionCategoriesService;
};

export function createListPermissionCategoriesHandler(
  dependencies: PermissionCategoriesHandlerDependencies,
): (context: Context<ApiEnvironment>) => Promise<Response> {
  return async (context: Context<ApiEnvironment>): Promise<Response> => {
    const rawLimit = context.req.query("limit");
    const parsed = permissionCategoriesQuerySchema.safeParse({
      limit: rawLimit === undefined ? undefined : rawLimit,
    });

    if (!parsed.success) {
      const details = parsed.error.issues.map((issue) => ({
        field: issue.path.join(".") || "query",
        message: issue.message,
      }));
      throw new ValidationError("Data tidak valid", details);
    }

    const categories = await dependencies.permissionCategoriesService.listPermissionCategories(
      parsed.data.limit,
    );
    return jsonSuccess(context, categories, 200);
  };
}

export function createUpdatePermissionCategoryHandler(
  dependencies: PermissionCategoriesHandlerDependencies,
): (context: Context<ApiEnvironment>) => Promise<Response> {
  return async (context: Context<ApiEnvironment>): Promise<Response> => {
    const parsedParam = permissionCategoryIdParamSchema.safeParse({
      categoryId: context.req.param("categoryId"),
    });

    if (!parsedParam.success) {
      const details = parsedParam.error.issues.map((issue) => ({
        field: issue.path.join(".") || "categoryId",
        message: issue.message,
      }));
      throw new ValidationError("Data tidak valid", details);
    }

    const rawBody: unknown = await context.req.json().catch(() => null);
    const parsedBody = updatePermissionCategoryRequestSchema.safeParse(rawBody);

    if (!parsedBody.success) {
      const details = parsedBody.error.issues.map((issue) => ({
        field: issue.path.join(".") || "body",
        message: issue.message,
      }));
      throw new ValidationError("Data tidak valid", details);
    }

    const updated = await dependencies.permissionCategoriesService.updateCategoryDownloadPermission(
      parsedParam.data.categoryId,
      parsedBody.data.downloadEnabled,
    );
    return jsonSuccess(context, updated, 200);
  };
}
