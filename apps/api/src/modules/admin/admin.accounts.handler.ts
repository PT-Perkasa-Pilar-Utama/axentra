import type { Context } from "hono";
import { z, type ZodError } from "zod";
import { adminUserListQuerySchema, updateAdminUserStatusRequestSchema } from "@axentra/shared";
import type { ApiEnvironment } from "../../environment";
import { ValidationError } from "../../http/errors";
import { jsonSuccess } from "../../http/responses";
import { getAuthenticatedUser } from "../../middleware/auth";
import type { AdminAccountService } from "./admin.accounts.service";

export type AdminAccountHandlerDependencies = {
  adminAccountService: AdminAccountService;
};

const userIdParamSchema = z.object({ id: z.string().uuid() });

function toValidationError(error: ZodError, fallbackField: string): ValidationError {
  const details = error.issues.map((issue) => ({
    field: issue.path.join(".") || fallbackField,
    message: issue.message,
  }));
  return new ValidationError("Data tidak valid", details);
}

export function createListAdminUsersHandler(
  dependencies: AdminAccountHandlerDependencies,
): (context: Context<ApiEnvironment>) => Promise<Response> {
  return async (context: Context<ApiEnvironment>): Promise<Response> => {
    const parsed = adminUserListQuerySchema.safeParse({
      page: context.req.query("page"),
      limit: context.req.query("limit"),
    });
    if (!parsed.success) throw toValidationError(parsed.error, "query");

    const result = await dependencies.adminAccountService.listManagedAccounts(parsed.data);
    return jsonSuccess(context, result.items, 200, result.meta);
  };
}

export function createUpdateAdminUserStatusHandler(
  dependencies: AdminAccountHandlerDependencies,
): (context: Context<ApiEnvironment>) => Promise<Response> {
  return async (context: Context<ApiEnvironment>): Promise<Response> => {
    const parsedParam = userIdParamSchema.safeParse({ id: context.req.param("id") });
    if (!parsedParam.success) throw toValidationError(parsedParam.error, "id");

    const actor = getAuthenticatedUser(context);

    let rawBody: unknown;
    try {
      rawBody = await context.req.json();
    } catch {
      throw new ValidationError("Data tidak valid", [
        { field: "body", message: "Format payload body tidak valid atau kosong" },
      ]);
    }
    const parsedBody = updateAdminUserStatusRequestSchema.safeParse(rawBody);
    if (!parsedBody.success) throw toValidationError(parsedBody.error, "body");

    const result = await dependencies.adminAccountService.updateAccountStatus({
      actor,
      userId: parsedParam.data.id,
      status: parsedBody.data.status,
    });
    return jsonSuccess(context, result, 200);
  };
}
