import { z } from "zod";

export const TOP_TAGS_DEFAULT_LIMIT = 10;
export const TOP_TAGS_MIN_LIMIT = 3;
export const TOP_TAGS_MAX_LIMIT = 20;
export const TOP_TAGS_MAX_CONTEXT_DOCUMENTS = 100;

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
