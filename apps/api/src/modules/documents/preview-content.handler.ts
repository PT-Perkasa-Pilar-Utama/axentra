import type { Handler } from "hono";
import { documentIdParamSchema } from "@axentra/shared";
import type { ApiEnvironment } from "../../environment";
import { ValidationError } from "../../http/errors";
import type { DocumentRouteDependencies } from "./documents.routes";
import { sanitizeFilename } from "./documents.service.helpers";
import type { PreviewContentOperationResult } from "./preview-content.operations";

// RFC 5987 attr-char excludes ' ( ) * which encodeURIComponent leaves unescaped.
function encodeRfc5987(value: string): string {
  return encodeURIComponent(value).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

export function buildPreviewContentHeaders(
  result: Pick<PreviewContentOperationResult, "filename" | "mimeType" | "bytes">,
): Record<string, string> {
  const asciiFallback = sanitizeFilename(result.filename);
  return {
    "Content-Type": result.mimeType,
    "Content-Disposition": `inline; filename="${asciiFallback}"; filename*=UTF-8''${encodeRfc5987(result.filename)}`,
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
    });

    return new Response(result.bytes, {
      status: 200,
      headers: buildPreviewContentHeaders(result),
    });
  };
}
