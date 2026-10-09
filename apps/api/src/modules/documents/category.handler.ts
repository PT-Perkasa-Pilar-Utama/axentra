import type { Context } from "hono";
import type { ApiEnvironment } from "../../environment";
import { ValidationError } from "../../http/errors";
import { jsonSuccess } from "../../http/responses";
import type { DocumentService } from "./documents.service";
import { documentIdParamSchema } from "./metadata.schema";

export type CategoryHandlerDependencies = {
  documentService: DocumentService;
};

export function createGetDocumentCategoryHandler(
  dependencies: CategoryHandlerDependencies,
): (context: Context<ApiEnvironment>) => Promise<Response> {
  return async (context: Context<ApiEnvironment>): Promise<Response> => {
    const rawId = context.req.param("id");
    const parsed = documentIdParamSchema.safeParse({ id: rawId });

    if (!parsed.success) {
      const details = parsed.error.issues.map((issue) => ({
        field: issue.path.join(".") || "id",
        message: issue.message,
      }));
      throw new ValidationError("ID dokumen harus berupa UUID yang valid", details);
    }

    const category = await dependencies.documentService.getDocumentCategory(parsed.data.id);
    return jsonSuccess(context, category, 200);
  };
}
