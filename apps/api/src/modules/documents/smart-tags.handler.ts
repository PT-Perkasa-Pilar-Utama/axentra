import type { Context } from "hono";
import type { ApiEnvironment } from "../../environment";
import { ValidationError } from "../../http/errors";
import { jsonSuccess } from "../../http/responses";
import type { DocumentService } from "./documents.service";
import { documentIdParamSchema } from "./metadata.schema";

export type SmartTagsHandlerDependencies = {
  documentService: DocumentService;
};

export function createGetDocumentSmartTagsHandler(
  dependencies: SmartTagsHandlerDependencies,
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

    const tags = await dependencies.documentService.getDocumentSmartTags(parsed.data.id);
    return jsonSuccess(context, tags, 200);
  };
}
