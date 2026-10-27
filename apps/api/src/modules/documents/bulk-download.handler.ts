import type { Handler } from "hono";
import { bulkDownloadRequestSchema } from "@axentra/shared";
import type { ApiEnvironment } from "../../environment";
import { ValidationError } from "../../http/errors";
import { getAuthenticatedUser } from "../../middleware/auth";
import type { DocumentRouteDependencies } from "./documents.routes";
import { sanitizeFilename } from "./documents.service.helpers";

export function createBulkDownloadHandler(
  dependencies: DocumentRouteDependencies,
): Handler<ApiEnvironment> {
  return async (context) => {
    const user = getAuthenticatedUser(context);
    const requestId = context.get("requestId");
    const logger = context.get("logger");

    const rawBody: unknown = await context.req.json().catch(() => null);
    const parsed = bulkDownloadRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new ValidationError(
        parsed.error.issues[0]?.message ?? "Payload unduhan massal tidak valid",
      );
    }

    const result = await dependencies.documentService.bulkDownloadDocuments({
      documentIds: parsed.data.documentIds,
      user,
      logger,
      requestId,
      signal: context.req.raw.signal,
    });

    const asciiFallback = sanitizeFilename(result.filename);
    const utf8Filename = encodeURIComponent(result.filename);

    return new Response(result.bytes, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${asciiFallback}"; filename*=UTF-8''${utf8Filename}`,
        "Content-Length": result.contentLength.toString(),
      },
    });
  };
}
