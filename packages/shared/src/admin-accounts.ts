import { z } from "zod";
import { paginationMetaSchema } from "./api";
import { pageLimitQueryFields } from "./pagination-query";

// Same defaults and limits as GET /audit/downloads (api-specs/09-admin.md, Shared Rules).
export const ADMIN_ACCOUNT_DEFAULT_PAGE = 1;
export const ADMIN_ACCOUNT_MAX_PAGE = 1_000;
export const ADMIN_ACCOUNT_DEFAULT_LIMIT = 20;
export const ADMIN_ACCOUNT_MAX_LIMIT = 100;

export const accountStatusSchema = z.enum(["active", "inactive"]);
export type AccountStatus = z.infer<typeof accountStatusSchema>;

// Admin accounts are never managed through these endpoints (api-specs/09-admin.md).
export const adminManagedRoleSchema = z.enum(["member_team", "head_of_team"]);
export type AdminManagedRole = z.infer<typeof adminManagedRoleSchema>;

export const adminUserSchema = z.object({
  id: z.string().uuid(),
  name: z.string().nullable(),
  email: z.string().min(1),
  role: adminManagedRoleSchema,
  status: accountStatusSchema,
});
export type AdminUser = z.infer<typeof adminUserSchema>;

export const adminUserListResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(adminUserSchema),
  meta: paginationMetaSchema,
});
export type AdminUserListResponse = z.infer<typeof adminUserListResponseSchema>;

export const adminUserListQuerySchema = z.object(
  pageLimitQueryFields({
    defaultPage: ADMIN_ACCOUNT_DEFAULT_PAGE,
    defaultLimit: ADMIN_ACCOUNT_DEFAULT_LIMIT,
    maxLimit: ADMIN_ACCOUNT_MAX_LIMIT,
    maxPage: ADMIN_ACCOUNT_MAX_PAGE,
  }),
);
export type AdminUserListQuery = z.infer<typeof adminUserListQuerySchema>;

export const updateAdminUserStatusRequestSchema = z
  .object({
    status: accountStatusSchema,
  })
  .strict();
export type UpdateAdminUserStatusRequest = z.infer<typeof updateAdminUserStatusRequestSchema>;

export const adminUserStatusResultSchema = z.object({
  id: z.string().uuid(),
  role: adminManagedRoleSchema,
  status: accountStatusSchema,
});
export type AdminUserStatusResult = z.infer<typeof adminUserStatusResultSchema>;

export const updateAdminUserStatusResponseSchema = z.object({
  success: z.literal(true),
  data: adminUserStatusResultSchema,
});
export type UpdateAdminUserStatusResponse = z.infer<typeof updateAdminUserStatusResponseSchema>;
