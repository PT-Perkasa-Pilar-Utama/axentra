import { describe, expect, it } from "bun:test";
import {
  ADMIN_ACCOUNT_MAX_LIMIT,
  adminUserListQuerySchema,
  adminUserSchema,
  updateAdminUserStatusRequestSchema,
} from "./index";

describe("admin account contracts (BE-S4-06)", () => {
  it("defaults the list to page 1 and limit 20 and caps the limit at 100", () => {
    expect(adminUserListQuerySchema.parse({})).toEqual({ page: 1, limit: 20 });
    expect(ADMIN_ACCOUNT_MAX_LIMIT).toBe(100);
    expect(adminUserListQuerySchema.safeParse({ limit: "101" }).success).toBe(false);
    expect(adminUserListQuerySchema.safeParse({ page: "1001" }).success).toBe(false);
    expect(adminUserListQuerySchema.safeParse({ page: "1.5" }).success).toBe(false);
  });

  it("allows only member_team and head_of_team as managed roles", () => {
    const base = {
      id: "00000000-0000-4000-8000-0000000000c1",
      name: null,
      email: "member@axentra.local",
      status: "active",
    };
    expect(adminUserSchema.safeParse({ ...base, role: "member_team" }).success).toBe(true);
    expect(adminUserSchema.safeParse({ ...base, role: "head_of_team" }).success).toBe(true);
    expect(adminUserSchema.safeParse({ ...base, role: "admin" }).success).toBe(false);
  });

  it("accepts only { status: active | inactive } with no extra keys", () => {
    expect(updateAdminUserStatusRequestSchema.safeParse({ status: "inactive" }).success).toBe(true);
    expect(updateAdminUserStatusRequestSchema.safeParse({ status: "deleted" }).success).toBe(false);
    expect(
      updateAdminUserStatusRequestSchema.safeParse({ status: "inactive", role: "admin" }).success,
    ).toBe(false);
  });
});
