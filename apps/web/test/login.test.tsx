import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { loginRequestSchema, type LoginRequest, type LoginResponse } from "@axentra/shared";
import { login } from "../src/features/auth/login.api";
import {
  LOGIN_MESSAGES,
  loginFormSchema,
  mapLoginError,
  useLoginPresenter,
  validateLoginInput,
  type LoginPresenter,
  type UseLoginPresenterOptions,
} from "../src/features/auth/login.presenter";
import { LoginPage, PerkasaLoginForm, PerkasaLogo } from "../src/features/auth/login.view";
import {
  apiRequest,
  ApiClientError,
  setAuthTokenGetter,
  setSessionRefresher,
  setUnauthorizedHandler,
} from "../src/lib/api-client";
import { z } from "zod";

const EXPIRES_AT = "2026-10-27T12:00:00.000Z";

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

function Harness(props: {
  onRender: (presenter: LoginPresenter) => void;
  options: UseLoginPresenterOptions;
}) {
  const presenter = useLoginPresenter(props.options);
  props.onRender(presenter);
  return createElement(PerkasaLoginForm, { presenter });
}

function renderPresenterHarness(options: UseLoginPresenterOptions = {}): {
  html: string;
  presenter: LoginPresenter;
} {
  const captured: { current: LoginPresenter | null } = { current: null };
  const capture = (presenter: LoginPresenter) => {
    captured.current = presenter;
  };

  const html = renderToString(createElement(Harness, { onRender: capture, options }));
  if (!captured.current) {
    throw new Error("Presenter failed to initialize");
  }
  return { html, presenter: captured.current };
}

const mockLoginResponse: LoginResponse = {
  user: {
    id: "usr-1",
    email: "user@perkasa.co.id",
    role: "member_team",
    name: "Aiman",
  },
  token: "mock-token",
  expiresAt: EXPIRES_AT,
};

afterEach(() => {
  setAuthTokenGetter(null);
  setUnauthorizedHandler(null);
  setSessionRefresher(null);
});

describe("login input validation (F1, F2)", () => {
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

  test("trims surrounding whitespace from the email before validating", () => {
    const result = validateLoginInput({ email: "  user@company.com  ", password: "secret" });
    expect(result.valid).toBe(true);
  });

  test("F2: form schema builds on the shared loginRequestSchema and adds a boolean rememberMe", () => {
    expect(loginRequestSchema.shape).toHaveProperty("rememberMe");
    expect(
      loginFormSchema.safeParse({ email: "a@b.co", password: "x", rememberMe: true }).success,
    ).toBe(true);
    expect(loginFormSchema.safeParse({ email: "a@b.co", password: "x" }).success).toBe(false);
  });
});

describe("login API client", () => {
  test("makes POST /auth/login request with remember me in the body and sends credentials", async () => {
    let capturedUrl = "";
    let capturedMethod: string | undefined;
    let capturedCredentials: RequestCredentials | undefined;
    let capturedBody: unknown;

    const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
      createMockFetch(async (input: RequestInfo | URL, init?: RequestInit) => {
        capturedUrl = String(input);
        capturedMethod = init?.method;
        capturedCredentials = init?.credentials;
        capturedBody = init?.body ? JSON.parse(String(init.body)) : null;

        return new Response(JSON.stringify({ success: true, data: mockLoginResponse }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );

    try {
      const payload: LoginRequest = {
        email: "user@company.com",
        password: "secretpassword",
        rememberMe: true,
      };

      const result = await login(payload);
      expect(capturedUrl).toContain("/auth/login");
      expect(capturedMethod).toBe("POST");
      expect(capturedCredentials).toBe("include");
      expect(capturedBody).toEqual(payload);
      expect(result.token).toBe("mock-token");
      expect(result.user.email).toBe("user@perkasa.co.id");
      expect(result.user.role).toBe("member_team");
      expect(result.expiresAt).toBe(EXPIRES_AT);
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

  test("a 401 from the login POST does not refresh the session or trigger the sign-out redirect", async () => {
    const unauthorizedHandler = mock(() => {});
    const refresher = mock(async () => true);
    setUnauthorizedHandler(unauthorizedHandler);
    setSessionRefresher(refresher);

    const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
      createMockFetch(
        async () =>
          new Response(
            JSON.stringify({
              success: false,
              error: { code: "UNAUTHORIZED", message: "Kredensial tidak valid" },
            }),
            { status: 401, headers: { "content-type": "application/json" } },
          ),
      ),
    );

    try {
      await expect(login({ email: "wrong@company.com", password: "bad" })).rejects.toMatchObject({
        status: 401,
      });
      expect(unauthorizedHandler).not.toHaveBeenCalled();
      expect(refresher).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  test("a 401 on a protected endpoint without a refresher signs out through the handler", async () => {
    setAuthTokenGetter(() => "ax_expired_token");
    const unauthorizedHandler = mock(() => {});
    setUnauthorizedHandler(unauthorizedHandler);

    const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
      createMockFetch(
        async () =>
          new Response(
            JSON.stringify({
              success: false,
              error: { code: "UNAUTHORIZED", message: "Token kadaluarsa" },
            }),
            { status: 401, headers: { "content-type": "application/json" } },
          ),
      ),
    );

    try {
      await expect(apiRequest("/documents", z.object({ ok: z.boolean() }))).rejects.toMatchObject({
        status: 401,
      });
      expect(unauthorizedHandler).toHaveBeenCalledTimes(1);
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

describe("login presenter interaction & error mapping (F3)", () => {
  test("submits valid credentials with rememberMe, passes payload to loginFn, and calls onSuccess", async () => {
    const capturedPayloads: LoginRequest[] = [];
    let successCalledWith: { response: LoginResponse; rememberMe: boolean } | undefined;

    const { presenter } = renderPresenterHarness({
      loginFn: async (payload) => {
        capturedPayloads.push(payload);
        return mockLoginResponse;
      },
      onSuccess: (response, rememberMe) => {
        successCalledWith = { response, rememberMe };
      },
    });

    const result = await presenter.submitValues({
      email: "user@perkasa.co.id",
      password: "validpassword",
      rememberMe: true,
    });

    expect(result).toBe(true);
    expect(capturedPayloads).toEqual([
      {
        email: "user@perkasa.co.id",
        password: "validpassword",
        rememberMe: true,
      },
    ]);
    expect(successCalledWith).toEqual({
      response: mockLoginResponse,
      rememberMe: true,
    });
  });

  test("sends rememberMe false when the checkbox is left unchecked", async () => {
    const capturedPayloads: LoginRequest[] = [];
    const { presenter } = renderPresenterHarness({
      loginFn: async (payload) => {
        capturedPayloads.push(payload);
        return mockLoginResponse;
      },
    });

    await presenter.submitValues({
      email: "user@perkasa.co.id",
      password: "validpassword",
      rememberMe: false,
    });

    expect(capturedPayloads[0]?.rememberMe).toBe(false);
  });

  test("rejects invalid input before loginFn and maps validation errors", async () => {
    let loginFnCalled = false;

    const { presenter } = renderPresenterHarness({
      initialEmail: "",
      loginFn: async () => {
        loginFnCalled = true;
        return mockLoginResponse;
      },
    });

    // Submitting form with empty inputs through React Hook Form boundary
    await presenter.handleSubmit();

    // Proves loginFn is NOT called on invalid input
    expect(loginFnCalled).toBe(false);

    // Direct validation helper also returns errors
    const validation = validateLoginInput({ email: "", password: "" });
    expect(validation.valid).toBe(false);
    expect(validation.errors.email).toBe(LOGIN_MESSAGES.EMAIL_REQUIRED);
    expect(validation.errors.password).toBe(LOGIN_MESSAGES.PASSWORD_REQUIRED);
  });

  test("maps 401 / UNAUTHORIZED to credential error alert and triggers onError", async () => {
    let capturedError: Error | undefined;

    const { presenter } = renderPresenterHarness({
      loginFn: async () => {
        throw new ApiClientError("UNAUTHORIZED", "Unauthorized", 401);
      },
      onError: (err) => {
        capturedError = err;
      },
    });

    const result = await presenter.submitValues({
      email: "user@perkasa.co.id",
      password: "wrongpassword",
      rememberMe: false,
    });

    expect(result).toBe(false);
    expect(capturedError?.message).toBe(LOGIN_MESSAGES.INVALID_CREDENTIALS);
    expect(mapLoginError(new ApiClientError("UNAUTHORIZED", "", 401))).toBe(
      LOGIN_MESSAGES.INVALID_CREDENTIALS,
    );
  });

  test("maps REQUEST_TIMEOUT to timeout error message", async () => {
    let capturedError: Error | undefined;

    const { presenter } = renderPresenterHarness({
      loginFn: async () => {
        throw new ApiClientError("REQUEST_TIMEOUT", "Timeout", 408);
      },
      onError: (err) => {
        capturedError = err;
      },
    });

    const result = await presenter.submitValues({
      email: "user@perkasa.co.id",
      password: "password123",
      rememberMe: false,
    });

    expect(result).toBe(false);
    expect(capturedError?.message).toBe(LOGIN_MESSAGES.TIMEOUT_ERROR);
    expect(mapLoginError(new ApiClientError("REQUEST_TIMEOUT", "", 408))).toBe(
      LOGIN_MESSAGES.TIMEOUT_ERROR,
    );
  });

  test("maps NETWORK_ERROR to network error message", async () => {
    let capturedError: Error | undefined;

    const { presenter } = renderPresenterHarness({
      loginFn: async () => {
        throw new ApiClientError("NETWORK_ERROR", "Network failed", 0);
      },
      onError: (err) => {
        capturedError = err;
      },
    });

    const result = await presenter.submitValues({
      email: "user@perkasa.co.id",
      password: "password123",
      rememberMe: false,
    });

    expect(result).toBe(false);
    expect(capturedError?.message).toBe(LOGIN_MESSAGES.NETWORK_ERROR);
    expect(mapLoginError(new ApiClientError("NETWORK_ERROR", "", 0))).toBe(
      LOGIN_MESSAGES.NETWORK_ERROR,
    );
  });

  test("maps generic Error to its message or generic fallback", () => {
    expect(mapLoginError(new Error("Custom server breakdown"))).toBe("Custom server breakdown");
    expect(mapLoginError("unknown")).toBe(LOGIN_MESSAGES.GENERIC_ERROR);
  });
});

describe("Perkasa login UI rendering (F1, F2)", () => {
  test("renders Perkasa logo and branding", () => {
    const html = renderToString(createElement(PerkasaLogo));
    expect(html).toContain("PERKASA");
    expect(html).toContain("Innovation Towards Intelligence");
  });

  test("renders login form with Bahasa Indonesia labels and placeholders (F1)", () => {
    const { html } = renderPresenterHarness({
      initialEmail: "user@perkasa.co.id",
      initialRememberMe: true,
    });

    expect(html).toContain("Alamat email");
    expect(html).toContain("Kata sandi");
    expect(html).toContain("Ingat saya");
    expect(html).toContain("Masuk");
    expect(html).toContain('placeholder="nama@perusahaan.com"');
    expect(html).toContain('placeholder="Masukkan kata sandi"');
  });

  test("renders submitting state with an accessible busy spinner on the submit button", () => {
    const dummyPresenter: LoginPresenter = {
      form: {
        register: (() => ({})) as never,
        formState: { errors: {} },
      } as never,
      showPassword: false,
      toggleShowPassword: () => {},
      isSubmitting: true,
      errorMessage: null,
      dismissError: () => {},
      handleSubmit: async () => {},
      submitValues: async () => true,
      reset: () => {},
    };

    const html = renderToString(createElement(PerkasaLoginForm, { presenter: dummyPresenter }));
    expect(html).toContain("Memproses...");
    expect(html).toContain("animate-spin");
    expect(html).toContain('aria-busy="true"');
  });

  test("renders the idle submit button without busy state", () => {
    const { html } = renderPresenterHarness();
    expect(html).toContain("Masuk");
    expect(html).toMatch(/aria-busy="false"/);
    expect(html).not.toContain("animate-spin");
  });

  test("renders error message envelope when errorMessage is present", () => {
    const dummyPresenter: LoginPresenter = {
      form: {
        register: (() => ({})) as never,
        formState: { errors: {} },
      } as never,
      showPassword: false,
      toggleShowPassword: () => {},
      isSubmitting: false,
      errorMessage: LOGIN_MESSAGES.INVALID_CREDENTIALS,
      dismissError: () => {},
      handleSubmit: async () => {},
      submitValues: async () => false,
      reset: () => {},
    };

    const html = renderToString(createElement(PerkasaLoginForm, { presenter: dummyPresenter }));
    expect(html).toContain("Email atau kata sandi salah");
    expect(html).toContain("login-error-alert");
    expect(html).toContain("login-error-message");
  });

  test("renders LoginPage within MemoryRouter", () => {
    const html = renderToString(createElement(MemoryRouter, null, createElement(LoginPage)));
    expect(html).toContain("PERKASA");
    expect(html).toContain("Masuk");
  });
});
