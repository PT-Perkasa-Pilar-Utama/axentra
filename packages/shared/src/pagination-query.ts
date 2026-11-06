import { z } from "zod";

const DEFAULT_PAGE = 1;

const parsePaginationQueryValue = (value: unknown, fallback: number): unknown => {
  if (value === undefined || value === "") return fallback;
  if (typeof value === "boolean") return Number.NaN;
  return value;
};

export type PageLimitQueryFields = {
  page: z.ZodType<number, unknown>;
  limit: z.ZodType<number, unknown>;
};

// Shared `page` and `limit` query fields. A missing value falls back to page 1 and the given default limit.
export function pageLimitQueryFields(limits: {
  defaultLimit: number;
  maxLimit: number;
  maxPage: number;
}): PageLimitQueryFields {
  return {
    page: z.preprocess(
      (value) => parsePaginationQueryValue(value, DEFAULT_PAGE),
      z.coerce
        .number({ message: "Halaman harus berupa angka" })
        .int({ message: "Halaman harus berupa bilangan bulat" })
        .min(1, { message: "Halaman minimal 1" })
        .max(limits.maxPage, { message: `Halaman maksimal ${limits.maxPage}` }),
    ),
    limit: z.preprocess(
      (value) => parsePaginationQueryValue(value, limits.defaultLimit),
      z.coerce
        .number({ message: "Limit harus berupa angka" })
        .int({ message: "Limit harus berupa bilangan bulat" })
        .min(1, { message: "Limit minimal 1" })
        .max(limits.maxLimit, { message: `Limit maksimal ${limits.maxLimit}` }),
    ),
  };
}
