import { describe, expect, it } from "bun:test";

import {
  USER_ROLES,
  authUserSchema,
  isValidUserRole,
  loginRequestSchema,
  loginResponseSchema,
  userRoleSchema,
} from "../src/auth";

describe("auth shared schemas", () => {
  describe("userRoleSchema and USER_ROLES", () => {
    it("contains member_team, head_of_team, and admin", () => {
      expect(USER_ROLES).toEqual(["member_team", "head_of_team", "admin"]);
    });

    it("accepts valid roles", () => {
      expect(userRoleSchema.parse("member_team")).toBe("member_team");
      expect(userRoleSchema.parse("head_of_team")).toBe("head_of_team");
      expect(userRoleSchema.parse("admin")).toBe("admin");
    });

    it("rejects invalid roles", () => {
      expect(() => userRoleSchema.parse("user")).toThrow();
      expect(() => userRoleSchema.parse("")).toThrow();
      expect(() => userRoleSchema.parse(123)).toThrow();
    });

    it("validates roles with isValidUserRole predicate", () => {
      expect(isValidUserRole("member_team")).toBe(true);
      expect(isValidUserRole("head_of_team")).toBe(true);
      expect(isValidUserRole("admin")).toBe(true);
      expect(isValidUserRole("user")).toBe(false);
      expect(isValidUserRole("")).toBe(false);
    });
  });

  describe("authUserSchema", () => {
    it("accepts valid authenticated user with email and name", () => {
      const valid = {
        id: "11111111-1111-4111-8111-111111111111",
        email: "sami@axentra.internal",
        role: "member_team" as const,
        name: "Sami",
      };
      expect(authUserSchema.parse(valid)).toEqual(valid);
    });

    it("accepts valid user without optional name", () => {
      const valid = {
        id: "22222222-2222-4222-8222-222222222222",
        email: "arya@axentra.internal",
        role: "head_of_team" as const,
      };
      expect(authUserSchema.parse(valid)).toEqual(valid);
    });

    it("rejects empty id", () => {
      expect(() =>
        authUserSchema.parse({
          id: "",
          email: "sami@axentra.internal",
          role: "member_team",
        }),
      ).toThrow();
    });

    it("rejects invalid email", () => {
      expect(() =>
        authUserSchema.parse({
          id: "user-123",
          email: "not-an-email",
          role: "member_team",
        }),
      ).toThrow();
    });

    it("rejects invalid role", () => {
      expect(() =>
        authUserSchema.parse({
          id: "user-123",
          email: "sami@axentra.internal",
          role: "superadmin",
        }),
      ).toThrow();
    });
  });

  describe("loginRequestSchema", () => {
    it("accepts valid login credentials", () => {
      const valid = {
        email: "sami@axentra.internal",
        password: "securepassword",
      };
      expect(loginRequestSchema.parse(valid)).toEqual(valid);
    });

    it("rejects invalid email format", () => {
      expect(() =>
        loginRequestSchema.parse({
          email: "not-an-email",
          password: "password123",
        }),
      ).toThrow();
    });

    it("rejects empty password", () => {
      expect(() =>
        loginRequestSchema.parse({
          email: "sami@axentra.internal",
          password: "",
        }),
      ).toThrow();
    });
  });

  describe("loginResponseSchema", () => {
    it("accepts valid login response", () => {
      const valid = {
        user: {
          id: "11111111-1111-4111-8111-111111111111",
          email: "sami@axentra.internal",
          role: "member_team" as const,
          name: "Sami",
        },
        token: "mock-token-xyz",
      };
      expect(loginResponseSchema.parse(valid)).toEqual(valid);
    });

    it("accepts login response with refreshToken", () => {
      const valid = {
        user: {
          id: "11111111-1111-4111-8111-111111111111",
          email: "sami@axentra.internal",
          role: "member_team" as const,
        },
        token: "mock-token-xyz",
        refreshToken: "mock-refresh-token",
      };
      expect(loginResponseSchema.parse(valid)).toEqual(valid);
    });

    it("rejects empty token", () => {
      expect(() =>
        loginResponseSchema.parse({
          user: {
            id: "11111111-1111-4111-8111-111111111111",
            email: "sami@axentra.internal",
            role: "member_team",
          },
          token: "",
        }),
      ).toThrow();
    });
  });
});
