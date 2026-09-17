import { z } from "zod";

export const errorDetailSchema = z.object({
  field: z.string(),
  message: z.string(),
});

export const apiErrorSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.array(errorDetailSchema).optional(),
  }),
});

export type ErrorDetail = z.infer<typeof errorDetailSchema>;
export type ApiErrorEnvelope = z.infer<typeof apiErrorSchema>;

export type PaginationMeta = {
  page: number;
  limit: number;
  total: number;
};

export type ApiSuccessEnvelope<T> = {
  success: true;
  data: T;
  meta?: PaginationMeta;
};

export type ApiEnvelope<T> = ApiSuccessEnvelope<T> | ApiErrorEnvelope;
