import type { Context } from "hono";
import type { ApiEnvironment } from "../../environment";
import { jsonSuccess } from "../../http/responses";
import type { AdminService } from "./admin.service";

export type AdminHandlerDependencies = {
  adminService: AdminService;
};

export function createGetAdminSummaryHandler(
  dependencies: AdminHandlerDependencies,
): (context: Context<ApiEnvironment>) => Promise<Response> {
  return async (context: Context<ApiEnvironment>): Promise<Response> => {
    const summary = await dependencies.adminService.getSummary();
    return jsonSuccess(context, summary, 200);
  };
}
