import type { Handler } from "hono";
import { documentIdParamSchema, downloadDocumentQuerySchema } from "@axentra/shared";
import type { ApiEnvironment } from "../../environment";
import { jsonSuccess } from "../../http/responses";
import { ValidationError } from "../../http/errors";
import { getAuthenticatedUser } from "../../middleware/auth";
import type { DocumentRouteDependencies } from "./documents.routes";
import { sanitizeFilename } from "./documents.service.helpers";

export function createDownloadDocumentHandler(
  dependencies: DocumentRouteDependencies,
): Handler<ApiEnvironment> {
  return async (context) => {
    const user = getAuthenticatedUser(context);
    const requestId = context.get("requestId");
    const logger = context.get("logger");

    const paramResult = documentIdParamSchema.safeParse(context.req.param());
    if (!paramResult.success) {
      throw new ValidationError(
        paramResult.error.issues[0]?.message ?? "ID dokumen harus berupa UUID yang valid",
      );
    }

    const queryResult = downloadDocumentQuerySchema.safeParse(context.req.query());
    if (!queryResult.success) {
      throw new ValidationError(
        queryResult.error.issues[0]?.message ?? "Parameter unduh tidak valid",
      );
    }

    const acceptHeader = context.req.header("accept")?.toLowerCase() ?? "";
    const prefersStream =
      queryResult.data.stream === true || acceptHeader.includes("application/octet-stream");

    const result = await dependencies.documentService.downloadDocument({
      documentId: paramResult.data.id,
      user,
      stream: prefersStream,
      expiresInSeconds: queryResult.data.expiresInSeconds,
      logger,
      requestId,
    });

    if (result.kind === "stream") {
      const asciiFallback = sanitizeFilename(result.filename);
      const utf8Filename = encodeURIComponent(result.filename);
      return new Response(result.bytes, {
        status: 200,
        headers: {
          "Content-Type": result.mimeType,
          "Content-Disposition": `attachment; filename="${asciiFallback}"; filename*=UTF-8''${utf8Filename}`,
          "Content-Length": result.fileSize.toString(),
        },
      });
    }

    return jsonSuccess(context, {
      downloadUrl: result.downloadUrl,
      filename: result.filename,
      mimeType: result.mimeType,
      fileSize: result.fileSize,
      expiresInSeconds: result.expiresInSeconds,
    });
  };
}
