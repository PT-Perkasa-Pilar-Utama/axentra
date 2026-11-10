import type { Context } from "hono";
import { adminDocumentsListQuerySchema, documentIdParamSchema } from "@axentra/shared";
import type { ApiEnvironment } from "../../environment";
import { ValidationError } from "../../http/errors";
import { jsonSuccess } from "../../http/responses";
import { getAuthenticatedUser } from "../../middleware/auth";
import type { AdminDocumentService } from "./admin.documents.service";

export type AdminDocumentHandlerDependencies = {
  adminDocumentService: AdminDocumentService;
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

export function createListAdminDocumentsHandler(
  dependencies: AdminDocumentHandlerDependencies,
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

    const result = await dependencies.adminDocumentService.listDocuments(parsed.data);
    return jsonSuccess(context, result.items, 200, result.meta);
  };
}

export function createGetAdminDocumentDetailHandler(
  dependencies: AdminDocumentHandlerDependencies,
): (context: Context<ApiEnvironment>) => Promise<Response> {
  return async (context: Context<ApiEnvironment>): Promise<Response> => {
    const documentId = parseDocumentIdParam(context);
    const detail = await dependencies.adminDocumentService.getDocumentDetail(documentId);
    return jsonSuccess(context, detail, 200);
  };
}

export function createArchiveAdminDocumentHandler(
  dependencies: AdminDocumentHandlerDependencies,
): (context: Context<ApiEnvironment>) => Promise<Response> {
  return async (context: Context<ApiEnvironment>): Promise<Response> => {
    const documentId = parseDocumentIdParam(context);
    const actor = getAuthenticatedUser(context);
    const result = await dependencies.adminDocumentService.archiveDocument({ actor, documentId });
    return jsonSuccess(context, result, 200);
  };
}

export function createUnarchiveAdminDocumentHandler(
  dependencies: AdminDocumentHandlerDependencies,
): (context: Context<ApiEnvironment>) => Promise<Response> {
  return async (context: Context<ApiEnvironment>): Promise<Response> => {
    const documentId = parseDocumentIdParam(context);
    const actor = getAuthenticatedUser(context);
    const result = await dependencies.adminDocumentService.unarchiveDocument({ actor, documentId });
    return jsonSuccess(context, result, 200);
  };
}

export function createDeleteAdminDocumentHandler(
  dependencies: AdminDocumentHandlerDependencies,
): (context: Context<ApiEnvironment>) => Promise<Response> {
  return async (context: Context<ApiEnvironment>): Promise<Response> => {
    const documentId = parseDocumentIdParam(context);
    const actor = getAuthenticatedUser(context);
    const result = await dependencies.adminDocumentService.deleteDocument({ actor, documentId });
    return jsonSuccess(context, result, 200);
  };
}
