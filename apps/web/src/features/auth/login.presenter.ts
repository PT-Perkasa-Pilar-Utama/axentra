import { useState, useCallback } from "react";
import type { FormEvent } from "react";
import { useForm, type FieldErrors, type Resolver, type UseFormReturn } from "react-hook-form";
import { z } from "zod";
import { loginRequestSchema } from "@axentra/shared";
import type { LoginRequest, LoginResponse } from "@axentra/shared";
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

/**
 * Aturan email dan kata sandi berasal dari loginRequestSchema (@axentra/shared). Form hanya
 * menambahkan checkbox "Ingat saya" yang selalu bernilai boolean.
 */
export const loginFormSchema = loginRequestSchema.extend({
  rememberMe: z.boolean(),
});

export type LoginFormValues = z.infer<typeof loginFormSchema>;

/** Pesan Bahasa Indonesia untuk field; email kosong dibedakan dari format yang salah. */
function toLoginMessage(field: "email" | "password", value: string): string {
  if (field === "password") return LOGIN_MESSAGES.PASSWORD_REQUIRED;
  return value.length === 0 ? LOGIN_MESSAGES.EMAIL_REQUIRED : LOGIN_MESSAGES.EMAIL_INVALID;
}

export function validateLoginInput(payload: { email: string; password: string }): {
  valid: boolean;
  errors: LoginFieldErrors;
} {
  const email = payload.email.trim();
  const result = loginFormSchema.safeParse({
    email,
    password: payload.password,
    rememberMe: false,
  });

  if (result.success) {
    return { valid: true, errors: {} };
  }

  const errors: LoginFieldErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0];
    if (field !== "email" && field !== "password") continue;
    if (!errors[field]) {
      errors[field] = toLoginMessage(field, field === "email" ? email : payload.password);
    }
  }
  return { valid: false, errors };
}

function toFieldErrors(errors: LoginFieldErrors): FieldErrors<LoginFormValues> {
  const fieldErrors: FieldErrors<LoginFormValues> = {};
  if (errors.email) {
    fieldErrors.email = { type: "validation", message: errors.email };
  }
  if (errors.password) {
    fieldErrors.password = { type: "validation", message: errors.password };
  }
  return fieldErrors;
}

const resolveLoginForm: Resolver<LoginFormValues> = async (values) => {
  const result = validateLoginInput(values);
  if (!result.valid) {
    return { values: {}, errors: toFieldErrors(result.errors) };
  }
  return {
    values: {
      email: values.email.trim(),
      password: values.password,
      rememberMe: values.rememberMe,
    },
    errors: {},
  };
};

export function mapLoginError(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.status === 401 || error.code === "UNAUTHORIZED") {
      return LOGIN_MESSAGES.INVALID_CREDENTIALS;
    }
    if (error.code === "REQUEST_TIMEOUT") {
      return LOGIN_MESSAGES.TIMEOUT_ERROR;
    }
    if (error.code === "NETWORK_ERROR") {
      return LOGIN_MESSAGES.NETWORK_ERROR;
    }
    if (error.message) {
      return error.message;
    }
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return LOGIN_MESSAGES.GENERIC_ERROR;
}

export type UseLoginPresenterOptions = {
  loginFn?: (payload: LoginRequest) => Promise<LoginResponse>;
  onSuccess?: (response: LoginResponse, rememberMe: boolean) => void;
  onError?: (error: Error) => void;
  initialEmail?: string;
  initialRememberMe?: boolean;
};

export type LoginPresenter = {
  form: UseFormReturn<LoginFormValues>;
  showPassword: boolean;
  toggleShowPassword: () => void;
  isSubmitting: boolean;
  errorMessage: string | null;
  dismissError: () => void;
  handleSubmit: (event?: FormEvent<HTMLFormElement>) => Promise<void>;
  submitValues: (values: LoginFormValues) => Promise<boolean>;
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

  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmittingManual, setIsSubmittingManual] = useState(false);

  const form = useForm<LoginFormValues>({
    resolver: resolveLoginForm,
    defaultValues: {
      email: initialEmail,
      password: "",
      rememberMe: initialRememberMe,
    },
    mode: "onSubmit",
  });

  const toggleShowPassword = useCallback((): void => {
    setShowPassword((prev) => !prev);
  }, []);

  const dismissError = useCallback((): void => {
    setErrorMessage(null);
  }, []);

  const submitValues = useCallback(
    async (values: LoginFormValues): Promise<boolean> => {
      setErrorMessage(null);
      setIsSubmittingManual(true);

      try {
        const payload: LoginRequest = {
          email: values.email.trim(),
          password: values.password,
          rememberMe: values.rememberMe,
        };
        const response = await loginFn(payload);
        setIsSubmittingManual(false);
        onSuccess?.(response, values.rememberMe);
        return true;
      } catch (error) {
        setIsSubmittingManual(false);
        const displayMessage = mapLoginError(error);
        setErrorMessage(displayMessage);
        onError?.(new Error(displayMessage));
        return false;
      }
    },
    [loginFn, onSuccess, onError],
  );

  const handleSubmit = useCallback(
    async (event?: FormEvent<HTMLFormElement>): Promise<void> => {
      if (event) {
        event.preventDefault();
      }
      await form.handleSubmit(async (values) => {
        await submitValues(values);
      })(event);
    },
    [form, submitValues],
  );

  const reset = useCallback((): void => {
    form.reset({
      email: "",
      password: "",
      rememberMe: false,
    });
    setShowPassword(false);
    setErrorMessage(null);
    setIsSubmittingManual(false);
  }, [form]);

  return {
    form,
    showPassword,
    toggleShowPassword,
    isSubmitting: isSubmittingManual || form.formState.isSubmitting,
    errorMessage,
    dismissError,
    handleSubmit,
    submitValues,
    reset,
  };
}
