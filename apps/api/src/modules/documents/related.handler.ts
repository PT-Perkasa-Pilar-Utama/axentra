import type { Context } from "hono";
import { documentIdParamSchema } from "@axentra/shared";
import type { ApiEnvironment } from "../../environment";
import { ValidationError } from "../../http/errors";
import { jsonSuccess } from "../../http/responses";
import type { DocumentService } from "./documents.service";

export type RelatedDocumentsHandlerDependencies = {
  documentService: DocumentService;
};

export function createListRelatedDocumentsHandler(
  dependencies: RelatedDocumentsHandlerDependencies,
): (context: Context<ApiEnvironment>) => Promise<Response> {
  return async (context: Context<ApiEnvironment>): Promise<Response> => {
    const parsed = documentIdParamSchema.safeParse({ id: context.req.param("id") });
    if (!parsed.success) {
      const details = parsed.error.issues.map((issue) => ({
        field: issue.path.join(".") || "id",
        message: issue.message,
      }));
      throw new ValidationError("ID dokumen harus berupa UUID yang valid", details);
    }

    const relatedDocuments = await dependencies.documentService.listRelatedDocuments(
      parsed.data.id,
    );
    return jsonSuccess(context, relatedDocuments, 200);
  };
}
