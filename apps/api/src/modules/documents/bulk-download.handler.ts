import type { Handler } from "hono";
import { bulkDownloadRequestSchema } from "@axentra/shared";
import type { ApiEnvironment } from "../../environment";
import { PayloadTooLargeError, ValidationError } from "../../http/errors";
import { getAuthenticatedUser } from "../../middleware/auth";
import { createBulkDownloadBody } from "./bulk-download.body";
import type { DocumentRouteDependencies } from "./documents.routes";
import { sanitizeFilename } from "./documents.service.helpers";

// A valid request names at most 100 UUIDs (about 4 KiB), so larger bodies are rejected unparsed.
export const BULK_DOWNLOAD_MAX_BODY_BYTES = 16 * 1024;
const BULK_DOWNLOAD_BODY_TOO_LARGE_MESSAGE = "Payload unduhan massal melebihi batas ukuran";

export function createBulkDownloadHandler(
  dependencies: DocumentRouteDependencies,
): Handler<ApiEnvironment> {
  return async (context) => {
    const user = getAuthenticatedUser(context);
    const requestId = context.get("requestId");
    const logger = context.get("logger");

    const rawBody = await readJsonBody(context.req.raw);
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

    // The concurrency slot and byte reservation are released when this body ends, not when the archive
    // is ready. No Content-Length is sent: Bun drops it on streamed bodies, so the response is chunked.
    const body = createBulkDownloadBody(result.bytes, {
      release: result.release,
      signal: context.req.raw.signal,
    });
    const asciiFallback = sanitizeFilename(result.filename);
    const utf8Filename = encodeURIComponent(result.filename);

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${asciiFallback}"; filename*=UTF-8''${utf8Filename}`,
      },
    });
  };
}

async function readJsonBody(request: Request): Promise<unknown> {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > BULK_DOWNLOAD_MAX_BODY_BYTES) {
    throw new PayloadTooLargeError(BULK_DOWNLOAD_BODY_TOO_LARGE_MESSAGE);
  }

  const text = await readBodyText(request);
  if (text === null) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed;
  } catch {
    return null;
  }
}

// Counts bytes while reading, so a missing or false Content-Length cannot exceed the cap.
async function readBodyText(request: Request): Promise<string | null> {
  if (request.body === null) return null;
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let text = "";
  try {
    let chunk = await reader.read();
    while (!chunk.done) {
      received += chunk.value.byteLength;
      if (received > BULK_DOWNLOAD_MAX_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new PayloadTooLargeError(BULK_DOWNLOAD_BODY_TOO_LARGE_MESSAGE);
      }
      text += decoder.decode(chunk.value, { stream: true });
      chunk = await reader.read();
    }
    return text + decoder.decode();
  } catch (error: unknown) {
    if (error instanceof PayloadTooLargeError) throw error;
    return null;
  }
}
