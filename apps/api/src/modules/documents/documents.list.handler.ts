import type { Context } from "hono";
import { recentDocumentListQuerySchema } from "@axentra/shared";
import type { ApiEnvironment } from "../../environment";
import { ValidationError } from "../../http/errors";
import { jsonSuccess } from "../../http/responses";
import type { DocumentService } from "./documents.service";

export type ListRecentDocumentsDependencies = {
  documentService: DocumentService;
};

export function createListRecentDocumentsHandler(
  dependencies: ListRecentDocumentsDependencies,
): (context: Context<ApiEnvironment>) => Promise<Response> {
  return async (context: Context<ApiEnvironment>): Promise<Response> => {
    const parsed = recentDocumentListQuerySchema.safeParse({
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

    const result = await dependencies.documentService.listRecentDocuments(
      parsed.data.page,
      parsed.data.limit,
    );
    return jsonSuccess(context, result.items, 200, result.meta);
  };
}
