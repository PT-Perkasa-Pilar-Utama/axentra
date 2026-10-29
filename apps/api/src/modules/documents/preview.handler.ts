import type { Handler } from "hono";
import { documentIdParamSchema } from "@axentra/shared";
import type { ApiEnvironment } from "../../environment";
import { jsonSuccess } from "../../http/responses";
import { ValidationError } from "../../http/errors";
import type { DocumentRouteDependencies } from "./documents.routes";

export function createPreviewDocumentHandler(
  dependencies: DocumentRouteDependencies,
): Handler<ApiEnvironment> {
  return async (context) => {
    const paramResult = documentIdParamSchema.safeParse(context.req.param());
    if (!paramResult.success) {
      throw new ValidationError(
        paramResult.error.issues[0]?.message ?? "ID dokumen harus berupa UUID yang valid",
      );
    }

    const result = await dependencies.documentService.previewDocument({
      documentId: paramResult.data.id,
    });

    return jsonSuccess(context, {
      filename: result.filename,
      mimeType: result.mimeType,
      fileSize: result.fileSize,
    });
  };
}
