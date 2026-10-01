import { z } from "zod";

export const TOP_TAGS_DEFAULT_LIMIT = 10;
export const TOP_TAGS_MIN_LIMIT = 3;
export const TOP_TAGS_MAX_LIMIT = 20;
export const TOP_TAGS_MAX_CONTEXT_DOCUMENTS = 100;

export const MAX_FILTER_TAGS = 20;
export const MAX_TAG_NAME_LENGTH = 50;

export function parseTagsQuery(value: unknown): string[] | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  let rawList: ReadonlyArray<unknown>;
  if (Array.isArray(value)) {
    rawList = value;
  } else if (typeof value === "string") {
    rawList = [value];
  } else {
    rawList = [];
  }
  const normalized = rawList
    .flatMap((item) => (typeof item === "string" ? item.split(",") : [String(item)]))
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  return normalized.length > 0 ? Array.from(new Set(normalized)) : undefined;
}

export const topTagsQuerySchema = z
  .object({
    context: z.enum(["dashboard", "search"]),
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

export type TopTagsQuery = z.infer<typeof topTagsQuerySchema>;

export const topTagSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  documentCount: z.number().int().nonnegative(),
});

export type TopTag = z.infer<typeof topTagSchema>;

export const topTagsResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(topTagSchema).max(TOP_TAGS_MAX_LIMIT),
});

export type TopTagsResponse = z.infer<typeof topTagsResponseSchema>;
