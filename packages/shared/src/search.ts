import { z } from "zod";
import { paginationMetaSchema } from "./api";
import { processingStatusSchema } from "./document";
import { MAX_FILTER_TAGS, MAX_TAG_NAME_LENGTH, parseTagsQuery } from "./tags";

export { MAX_FILTER_TAGS, MAX_TAG_NAME_LENGTH, parseTagsQuery };

const blankQueryValue = (value: unknown, fallback: number): unknown =>
  value === undefined || value === "" ? fallback : value;

export const searchDocumentsQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  tags: z
    .preprocess(
      parseTagsQuery,
      z
        .array(
          z
            .string()
            .min(1, { message: "Tag tidak boleh kosong" })
            .max(MAX_TAG_NAME_LENGTH, { message: "Nama tag melebihi batas maksimum" }),
        )
        .max(MAX_FILTER_TAGS, { message: "Jumlah filter tag melebihi batas maksimum" })
        .optional(),
    )
    .optional(),
  categoryId: z.string().uuid({ message: "ID kategori harus berupa UUID yang valid" }).optional(),
  page: z.preprocess(
    (value) => blankQueryValue(value, 1),
    z.coerce.number().int().min(1).max(1_000),
  ),
  limit: z.preprocess(
    (value) => blankQueryValue(value, 20),
    z.coerce.number().int().min(1).max(100),
  ),
});

export type SearchDocumentsQuery = z.infer<typeof searchDocumentsQuerySchema>;

export const searchDocumentSchema = z.object({
  id: z.string().uuid(),
  filename: z.string().min(1),
  processingStatus: processingStatusSchema,
  createdAt: z.string().datetime(),
  snippet: z.string().nullable().optional(),
});

export type SearchDocument = z.infer<typeof searchDocumentSchema>;

export const searchDocumentsResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(searchDocumentSchema),
  meta: paginationMetaSchema,
});

export type SearchDocumentsResponse = z.infer<typeof searchDocumentsResponseSchema>;
