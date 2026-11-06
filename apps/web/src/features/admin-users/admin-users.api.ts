import { z } from "zod";
import type { PaginationMeta } from "@axentra/shared";
import { apiRequest, apiRequestPage } from "../../lib/api-client";

export const ADMIN_USERS_DEFAULT_PAGE = 1;
export const ADMIN_USERS_DEFAULT_LIMIT = 20;
export const ADMIN_USERS_MIN_LIMIT = 1;
export const ADMIN_USERS_MAX_LIMIT = 100;
export const ADMIN_USERS_MIN_PAGE = 1;
export const ADMIN_USERS_MAX_PAGE = 1000;

export const adminUserRoleSchema = z.enum(["member_team", "head_of_team"]);
export type AdminUserRole = z.infer<typeof adminUserRoleSchema>;

export const adminUserStatusSchema = z.enum(["active", "inactive"]);
export type AdminUserStatus = z.infer<typeof adminUserStatusSchema>;

export const adminUserSchema = z.object({
  id: z.string().uuid(),
  name: z.string().nullable(),
  email: z.string().email(),
  role: adminUserRoleSchema,
  status: adminUserStatusSchema,
});
export type AdminUser = z.infer<typeof adminUserSchema>;

export const adminUserListSchema = z.array(adminUserSchema);

export const updateAdminUserStatusPayloadSchema = z.object({
  status: adminUserStatusSchema,
});
export type UpdateAdminUserStatusPayload = z.infer<typeof updateAdminUserStatusPayloadSchema>;

export const updateAdminUserStatusResponseSchema = z.object({
  id: z.string().uuid(),
  role: adminUserRoleSchema,
  status: adminUserStatusSchema,
});
export type UpdateAdminUserStatusResponse = z.infer<typeof updateAdminUserStatusResponseSchema>;

export type AdminUsersPage = {
  items: AdminUser[];
  meta: PaginationMeta;
};

export async function listAdminUsers(
  page: number = ADMIN_USERS_DEFAULT_PAGE,
  limit: number = ADMIN_USERS_DEFAULT_LIMIT,
): Promise<AdminUsersPage> {
  const boundedPage = Math.min(
    ADMIN_USERS_MAX_PAGE,
    Math.max(ADMIN_USERS_MIN_PAGE, Math.floor(page)),
  );
  const boundedLimit = Math.min(
    ADMIN_USERS_MAX_LIMIT,
    Math.max(ADMIN_USERS_MIN_LIMIT, Math.floor(limit)),
  );
  const params = new URLSearchParams({
    page: String(boundedPage),
    limit: String(boundedLimit),
  });
  const { data, meta } = await apiRequestPage(
    `/admin/users?${params.toString()}`,
    adminUserListSchema,
  );
  return { items: data, meta };
}

export async function updateAdminUserStatus(
  id: string,
  status: AdminUserStatus,
): Promise<UpdateAdminUserStatusResponse> {
  const safeId = encodeURIComponent(id);
  const payload: UpdateAdminUserStatusPayload = { status };
  return apiRequest(`/admin/users/${safeId}/status`, updateAdminUserStatusResponseSchema, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}
