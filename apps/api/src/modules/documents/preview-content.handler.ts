import type { Handler } from "hono";
import { documentIdParamSchema } from "@axentra/shared";
import type { ApiEnvironment } from "../../environment";
import { ValidationError } from "../../http/errors";
import { buildContentDisposition } from "./content-disposition";
import type { DocumentRouteDependencies } from "./documents.routes";
import type { PreviewContentOperationResult } from "./preview-content.operations";

export function buildPreviewContentHeaders(
  result: Pick<PreviewContentOperationResult, "filename" | "mimeType" | "bytes">,
): Record<string, string> {
  return {
    "Content-Type": result.mimeType,
    "Content-Disposition": buildContentDisposition("inline", result.filename),
    "Content-Length": result.bytes.byteLength.toString(),
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, no-store",
  };
}

export function createPreviewDocumentContentHandler(
  dependencies: DocumentRouteDependencies,
): Handler<ApiEnvironment> {
  return async (context) => {
    const paramResult = documentIdParamSchema.safeParse(context.req.param());
    if (!paramResult.success) {
      throw new ValidationError(
        paramResult.error.issues[0]?.message ?? "ID dokumen harus berupa UUID yang valid",
      );
    }

    const result = await dependencies.documentService.previewDocumentContent({
      documentId: paramResult.data.id,
      requestId: context.get("requestId"),
      logger: context.get("logger"),
      signal: context.req.raw.signal,
    });

    return new Response(result.bytes, {
      status: 200,
      headers: buildPreviewContentHeaders(result),
    });
  };
}
