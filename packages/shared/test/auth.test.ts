import { describe, expect, it } from "bun:test";

import {
  authUserSchema,
  loginRequestSchema,
  loginResponseSchema,
  userRoleSchema,
} from "../src/auth";

describe("auth shared schemas", () => {
  describe("userRoleSchema", () => {
    it("accepts valid roles", () => {
      expect(userRoleSchema.parse("member_team")).toBe("member_team");
      expect(userRoleSchema.parse("head_of_team")).toBe("head_of_team");
    });

    it("rejects invalid roles", () => {
      expect(() => userRoleSchema.parse("admin")).toThrow();
      expect(() => userRoleSchema.parse("user")).toThrow();
      expect(() => userRoleSchema.parse("")).toThrow();
      expect(() => userRoleSchema.parse(123)).toThrow();
    });
  });

  describe("authUserSchema", () => {
    it("accepts valid authenticated user", () => {
      const valid = {
        id: "11111111-1111-4111-8111-111111111111",
        role: "member_team" as const,
        name: "Sami",
      };
      expect(authUserSchema.parse(valid)).toEqual(valid);
    });

    it("accepts head_of_team role", () => {
      const valid = {
        id: "22222222-2222-4222-8222-222222222222",
        role: "head_of_team" as const,
        name: "Arya Isnaidi",
      };
      expect(authUserSchema.parse(valid)).toEqual(valid);
    });

    it("rejects invalid UUID", () => {
      expect(() =>
        authUserSchema.parse({
          id: "not-a-uuid",
          role: "member_team",
          name: "Sami",
        }),
      ).toThrow();
    });

    it("rejects empty name", () => {
      expect(() =>
        authUserSchema.parse({
          id: "11111111-1111-4111-8111-111111111111",
          role: "member_team",
          name: "",
        }),
      ).toThrow();
    });

    it("rejects invalid role", () => {
      expect(() =>
        authUserSchema.parse({
          id: "11111111-1111-4111-8111-111111111111",
          role: "superadmin",
          name: "Sami",
        }),
      ).toThrow();
    });
  });

  describe("loginRequestSchema", () => {
    it("accepts valid login credentials", () => {
      const valid = {
        email: "sami@axentra.internal",
        password: "password123",
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
          role: "member_team" as const,
          name: "Sami",
        },
        token: "mock-token-xyz",
      };
      expect(loginResponseSchema.parse(valid)).toEqual(valid);
    });

    it("rejects empty token", () => {
      expect(() =>
        loginResponseSchema.parse({
          user: {
            id: "11111111-1111-4111-8111-111111111111",
            role: "member_team",
            name: "Sami",
          },
          token: "",
        }),
      ).toThrow();
    });
  });
});
