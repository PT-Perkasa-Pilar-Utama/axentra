import { z } from "zod";
import {
  TOP_TAGS_DEFAULT_LIMIT,
  TOP_TAGS_MAX_CONTEXT_DOCUMENTS,
  TOP_TAGS_MAX_LIMIT,
  TOP_TAGS_MIN_LIMIT,
  type TopTagsQuery,
} from "@axentra/shared";

// Mirrors TopTagsQuery["context"] in @axentra/shared. The satisfies check fails to compile if the
// shared request type stops accepting one of these literals.
const TOP_TAG_CONTEXTS = [
  "dashboard",
  "search",
] as const satisfies readonly TopTagsQuery["context"][];

export const topTagsQuerySchema = z
  .object({
    context: z.enum(TOP_TAG_CONTEXTS),
    limit: z.coerce
      .number()
      .int()
      .min(TOP_TAGS_MIN_LIMIT)
      .max(TOP_TAGS_MAX_LIMIT)
      .default(TOP_TAGS_DEFAULT_LIMIT),
    documentIds: z.array(z.string().uuid()).max(TOP_TAGS_MAX_CONTEXT_DOCUMENTS).optional(),
  })
  .superRefine((query, context) => {
    if (query.context === "dashboard" && query.documentIds !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["documentIds"],
        message: "documentIds hanya berlaku untuk konteks search",
      });
    }
  });
