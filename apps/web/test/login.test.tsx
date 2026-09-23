import { describe, expect, spyOn, test } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import type { LoginRequest, LoginResponse } from "@axentra/shared";
import { login } from "../src/features/auth/login.api";
import { LOGIN_MESSAGES, validateLoginInput } from "../src/features/auth/login.presenter";
import { LoginPage, PerkasaLoginForm, PerkasaLogo } from "../src/features/auth/login.view";
import { ApiClientError } from "../src/lib/api-client";

function createMockFetch(
  handler: (input: RequestInfo | URL, init?: RequestInit | undefined) => Promise<Response>,
) {
  return Object.assign(handler, {
    preconnect: (
      _url: string | URL,
      _options?: { dns?: boolean; tcp?: boolean; http?: boolean; https?: boolean } | undefined,
    ): void => {},
  });
}

describe("login input validation", () => {
  test("returns error when email and password are empty", () => {
    const result = validateLoginInput({ email: "", password: "" });
    expect(result.valid).toBe(false);
    expect(result.errors.email).toBe(LOGIN_MESSAGES.EMAIL_REQUIRED);
    expect(result.errors.password).toBe(LOGIN_MESSAGES.PASSWORD_REQUIRED);
  });

  test("returns error for invalid email format", () => {
    const result = validateLoginInput({ email: "invalid-email", password: "password123" });
    expect(result.valid).toBe(false);
    expect(result.errors.email).toBe(LOGIN_MESSAGES.EMAIL_INVALID);
    expect(result.errors.password).toBeUndefined();
  });

  test("returns valid for correct credentials format", () => {
    const result = validateLoginInput({
      email: "user@company.com",
      password: "secretpassword",
    });
    expect(result.valid).toBe(true);
    expect(result.errors.email).toBeUndefined();
    expect(result.errors.password).toBeUndefined();
  });
});

describe("login API client", () => {
  test("makes POST /auth/login request with valid payload", async () => {
    let capturedUrl = "";
    let capturedMethod: string | undefined;
    let capturedBody: unknown;

    const mockResponse: LoginResponse = {
      user: {
        id: "usr-123",
        email: "user@company.com",
        role: "member_team",
        name: "Test User",
      },
      token: "ax_token_xyz",
      refreshToken: "ax_rt_xyz",
    };

    const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
      createMockFetch(async (input: RequestInfo | URL, init?: RequestInit) => {
        capturedUrl = String(input);
        capturedMethod = init?.method;
        capturedBody = init?.body ? JSON.parse(String(init.body)) : null;

        return new Response(
          JSON.stringify({
            success: true,
            data: mockResponse,
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }),
    );

    try {
      const payload: LoginRequest = {
        email: "user@company.com",
        password: "secretpassword",
      };

      const result = await login(payload);
      expect(capturedUrl).toContain("/auth/login");
      expect(capturedMethod).toBe("POST");
      expect(capturedBody).toEqual(payload);
      expect(result.token).toBe("ax_token_xyz");
      expect(result.user.email).toBe("user@company.com");
      expect(result.user.role).toBe("member_team");
    } finally {
      fetchSpy.mockRestore();
    }
  });

  test("throws ApiClientError when API responds with 401 unauthorized", async () => {
    const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
      createMockFetch(async () => {
        return new Response(
          JSON.stringify({
            success: false,
            error: {
              code: "UNAUTHORIZED",
              message: "Kredensial tidak valid",
            },
          }),
          {
            status: 401,
            headers: { "content-type": "application/json" },
          },
        );
      }),
    );

    try {
      await expect(login({ email: "wrong@company.com", password: "bad" })).rejects.toThrow(
        ApiClientError,
      );
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

describe("Perkasa login UI rendering", () => {
  test("renders Perkasa logo and branding", () => {
    const html = renderToString(createElement(PerkasaLogo));
    expect(html).toContain("PERKASA");
    expect(html).toContain("Innovation Towards Intelligence");
  });

  test("renders login form with fields and buttons", () => {
    const dummyPresenter = {
      email: "user@company.com",
      setEmail: () => {},
      password: "secret",
      setPassword: () => {},
      rememberMe: true,
      setRememberMe: () => {},
      showPassword: false,
      toggleShowPassword: () => {},
      isSubmitting: false,
      errorMessage: null,
      fieldErrors: {},
      dismissError: () => {},
      handleSubmit: async () => true,
      reset: () => {},
    };

    const html = renderToString(createElement(PerkasaLoginForm, { presenter: dummyPresenter }));
    expect(html).toContain("Email address");
    expect(html).toContain("Password");
    expect(html).toContain("Remember me");
    expect(html).toContain("Sign in");
  });

  test("renders error message envelope when errorMessage is present", () => {
    const dummyPresenter = {
      email: "",
      setEmail: () => {},
      password: "",
      setPassword: () => {},
      rememberMe: false,
      setRememberMe: () => {},
      showPassword: false,
      toggleShowPassword: () => {},
      isSubmitting: false,
      errorMessage: LOGIN_MESSAGES.INVALID_CREDENTIALS,
      fieldErrors: {},
      dismissError: () => {},
      handleSubmit: async () => false,
      reset: () => {},
    };

    const html = renderToString(createElement(PerkasaLoginForm, { presenter: dummyPresenter }));
    expect(html).toContain("Email atau kata sandi salah");
    expect(html).toContain("login-error-alert");
  });

  test("renders LoginPage within MemoryRouter", () => {
    const html = renderToString(createElement(MemoryRouter, null, createElement(LoginPage)));
    expect(html).toContain("PERKASA");
    expect(html).toContain("Sign in");
  });
});
