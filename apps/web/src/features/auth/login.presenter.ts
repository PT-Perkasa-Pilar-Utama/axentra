import { useState, useCallback } from "react";
import type { FormEvent } from "react";
import type { LoginRequest, LoginResponse } from "@axentra/shared";
import { loginRequestSchema } from "@axentra/shared";
import { login as defaultLoginFn } from "./login.api";
import { ApiClientError } from "../../lib/api-client";

export type LoginFieldErrors = {
  email?: string | undefined;
  password?: string | undefined;
};

export const LOGIN_MESSAGES = {
  EMAIL_REQUIRED: "Email wajib diisi",
  EMAIL_INVALID: "Format email tidak valid",
  PASSWORD_REQUIRED: "Kata sandi wajib diisi",
  INVALID_CREDENTIALS: "Email atau kata sandi salah",
  NETWORK_ERROR: "Tidak dapat terhubung ke server",
  TIMEOUT_ERROR: "Server tidak merespons tepat waktu",
  GENERIC_ERROR: "Terjadi kesalahan saat masuk",
} as const;

export function validateLoginInput(payload: { email: string; password: string }): {
  valid: boolean;
  errors: LoginFieldErrors;
} {
  const trimmedEmail = payload.email.trim();
  const errors: LoginFieldErrors = {};

  if (!trimmedEmail) {
    errors.email = LOGIN_MESSAGES.EMAIL_REQUIRED;
  }

  if (!payload.password) {
    errors.password = LOGIN_MESSAGES.PASSWORD_REQUIRED;
  }

  if (errors.email || errors.password) {
    return { valid: false, errors };
  }

  const parsed = loginRequestSchema.safeParse({
    email: trimmedEmail,
    password: payload.password,
  });

  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (field === "email" && !errors.email) {
        errors.email = LOGIN_MESSAGES.EMAIL_INVALID;
      } else if (field === "password" && !errors.password) {
        errors.password = LOGIN_MESSAGES.PASSWORD_REQUIRED;
      }
    }
    return { valid: false, errors };
  }

  return { valid: true, errors: {} };
}

export type UseLoginPresenterOptions = {
  loginFn?: (payload: LoginRequest) => Promise<LoginResponse>;
  onSuccess?: (response: LoginResponse, rememberMe: boolean) => void;
  onError?: (error: Error) => void;
  initialEmail?: string;
  initialRememberMe?: boolean;
};

export type LoginPresenter = {
  email: string;
  setEmail: (email: string) => void;
  password: string;
  setPassword: (password: string) => void;
  rememberMe: boolean;
  setRememberMe: (remember: boolean) => void;
  showPassword: boolean;
  toggleShowPassword: () => void;
  isSubmitting: boolean;
  errorMessage: string | null;
  fieldErrors: LoginFieldErrors;
  dismissError: () => void;
  handleSubmit: (event?: FormEvent<HTMLFormElement>) => Promise<boolean>;
  reset: () => void;
};

export function useLoginPresenter(options: UseLoginPresenterOptions = {}): LoginPresenter {
  const {
    loginFn = defaultLoginFn,
    onSuccess,
    onError,
    initialEmail = "",
    initialRememberMe = false,
  } = options;

  const [email, setEmailState] = useState(initialEmail);
  const [password, setPasswordState] = useState("");
  const [rememberMe, setRememberMe] = useState(initialRememberMe);
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<LoginFieldErrors>({});

  const setEmail = useCallback((value: string): void => {
    setEmailState(value);
    setFieldErrors((prev) => {
      if (!prev.email) return prev;
      const { email: _, ...rest } = prev;
      return rest;
    });
  }, []);

  const setPassword = useCallback((value: string): void => {
    setPasswordState(value);
    setFieldErrors((prev) => {
      if (!prev.password) return prev;
      const { password: _, ...rest } = prev;
      return rest;
    });
  }, []);

  const toggleShowPassword = useCallback((): void => {
    setShowPassword((prev) => !prev);
  }, []);

  const dismissError = useCallback((): void => {
    setErrorMessage(null);
  }, []);

  const reset = useCallback((): void => {
    setEmailState("");
    setPasswordState("");
    setRememberMe(false);
    setShowPassword(false);
    setIsSubmitting(false);
    setErrorMessage(null);
    setFieldErrors({});
  }, []);

  const handleSubmit = useCallback(
    async (event?: FormEvent<HTMLFormElement>): Promise<boolean> => {
      if (event) {
        event.preventDefault();
      }

      setErrorMessage(null);
      const validation = validateLoginInput({ email, password });
      if (!validation.valid) {
        setFieldErrors(validation.errors);
        return false;
      }

      setFieldErrors({});
      setIsSubmitting(true);

      try {
        const payload: LoginRequest = {
          email: email.trim(),
          password,
        };
        const response = await loginFn(payload);
        setIsSubmitting(false);
        onSuccess?.(response, rememberMe);
        return true;
      } catch (error) {
        setIsSubmitting(false);

        let displayMessage: string = LOGIN_MESSAGES.GENERIC_ERROR;

        if (error instanceof ApiClientError) {
          if (error.status === 401 || error.code === "UNAUTHORIZED") {
            displayMessage = LOGIN_MESSAGES.INVALID_CREDENTIALS;
          } else if (error.code === "REQUEST_TIMEOUT") {
            displayMessage = LOGIN_MESSAGES.TIMEOUT_ERROR;
          } else if (error.code === "NETWORK_ERROR") {
            displayMessage = LOGIN_MESSAGES.NETWORK_ERROR;
          } else if (error.message) {
            displayMessage = error.message;
          }
        } else if (error instanceof Error && error.message) {
          displayMessage = error.message;
        }

        setErrorMessage(displayMessage);
        onError?.(error instanceof Error ? error : new Error(displayMessage));
        return false;
      }
    },
    [email, password, rememberMe, loginFn, onSuccess, onError],
  );

  return {
    email,
    setEmail,
    password,
    setPassword,
    rememberMe,
    setRememberMe,
    showPassword,
    toggleShowPassword,
    isSubmitting,
    errorMessage,
    fieldErrors,
    dismissError,
    handleSubmit,
    reset,
  };
}
