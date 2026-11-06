import type { Context } from "hono";
import { adminDocumentsListQuerySchema, documentIdParamSchema } from "@axentra/shared";
import type { ApiEnvironment } from "../../environment";
import { ValidationError } from "../../http/errors";
import { jsonSuccess } from "../../http/responses";
import type { AdminService } from "./admin.service";

export type AdminHandlerDependencies = {
  adminService: AdminService;
};

function parseDocumentIdParam(context: Context<ApiEnvironment>): string {
  const parsed = documentIdParamSchema.safeParse({ id: context.req.param("id") });
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => ({
      field: issue.path.join(".") || "id",
      message: issue.message,
    }));
    throw new ValidationError("ID dokumen harus berupa UUID yang valid", details);
  }
  return parsed.data.id;
}

export function createGetAdminSummaryHandler(
  dependencies: AdminHandlerDependencies,
): (context: Context<ApiEnvironment>) => Promise<Response> {
  return async (context: Context<ApiEnvironment>): Promise<Response> => {
    const summary = await dependencies.adminService.getSummary();
    return jsonSuccess(context, summary, 200);
  };
}

export function createListAdminDocumentsHandler(
  dependencies: AdminHandlerDependencies,
): (context: Context<ApiEnvironment>) => Promise<Response> {
  return async (context: Context<ApiEnvironment>): Promise<Response> => {
    const parsed = adminDocumentsListQuerySchema.safeParse({
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

    const result = await dependencies.adminService.listDocuments(parsed.data);
    return jsonSuccess(context, result.items, 200, result.meta);
  };
}

export function createGetAdminDocumentDetailHandler(
  dependencies: AdminHandlerDependencies,
): (context: Context<ApiEnvironment>) => Promise<Response> {
  return async (context: Context<ApiEnvironment>): Promise<Response> => {
    const documentId = parseDocumentIdParam(context);
    const detail = await dependencies.adminService.getDocumentDetail(documentId);
    return jsonSuccess(context, detail, 200);
  };
}

export function createArchiveAdminDocumentHandler(
  dependencies: AdminHandlerDependencies,
): (context: Context<ApiEnvironment>) => Promise<Response> {
  return async (context: Context<ApiEnvironment>): Promise<Response> => {
    const documentId = parseDocumentIdParam(context);
    const result = await dependencies.adminService.archiveDocument(documentId);
    return jsonSuccess(context, result, 200);
  };
}

export function createUnarchiveAdminDocumentHandler(
  dependencies: AdminHandlerDependencies,
): (context: Context<ApiEnvironment>) => Promise<Response> {
  return async (context: Context<ApiEnvironment>): Promise<Response> => {
    const documentId = parseDocumentIdParam(context);
    const result = await dependencies.adminService.unarchiveDocument(documentId);
    return jsonSuccess(context, result, 200);
  };
}

export function createDeleteAdminDocumentHandler(
  dependencies: AdminHandlerDependencies,
): (context: Context<ApiEnvironment>) => Promise<Response> {
  return async (context: Context<ApiEnvironment>): Promise<Response> => {
    const documentId = parseDocumentIdParam(context);
    const result = await dependencies.adminService.deleteDocument(documentId);
    return jsonSuccess(context, result, 200);
  };
}
