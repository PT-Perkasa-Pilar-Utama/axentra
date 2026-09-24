import type React from "react";
import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router";
import {
  useLoginPresenter,
  type LoginPresenter,
  type UseLoginPresenterOptions,
} from "./login.presenter";
import { PerkasaLogo, PerkasaBackgroundDecorations } from "./login-logo.view";
import { useOptionalAuthSession } from "./auth-session.context";

export { PerkasaLogo, PerkasaBackgroundDecorations };

export type PerkasaLoginFormProps = {
  presenter: LoginPresenter;
};

export function PerkasaLoginForm({ presenter }: PerkasaLoginFormProps): React.JSX.Element {
  const {
    form: {
      register,
      formState: { errors },
    },
    showPassword,
    toggleShowPassword,
    isSubmitting,
    errorMessage,
    dismissError,
    handleSubmit,
  } = presenter;

  return (
    <div className="w-full max-w-[420px] rounded-2xl bg-white p-8 shadow-xl shadow-slate-200/60 border border-slate-100">
      <div className="mb-8 flex justify-center">
        <PerkasaLogo />
      </div>

      {errorMessage && (
        <div
          role="alert"
          aria-live="polite"
          data-testid="login-error-alert"
          className="mb-5 flex items-start justify-between gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 font-medium"
        >
          <div className="flex items-center gap-2">
            <svg
              className="h-4 w-4 flex-shrink-0 text-red-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <span data-testid="login-error-message">{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={dismissError}
            aria-label="Tutup pesan error"
            className="text-red-400 hover:text-red-600 focus:outline-none"
          >
            ✕
          </button>
        </div>
      )}

      <form onSubmit={(e) => void handleSubmit(e)} noValidate className="space-y-5">
        <div>
          <label htmlFor="email" className="mb-1.5 block text-xs font-semibold text-slate-700">
            Alamat email
          </label>
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
            </div>
            <input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="nama@perusahaan.com"
              disabled={isSubmitting}
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? "email-error" : undefined}
              className={`w-full rounded-lg border py-2.5 pl-10 pr-3.5 text-sm text-slate-800 placeholder-slate-400 transition-colors focus:outline-none focus:ring-2 focus:ring-[#5b9a42]/30 ${
                errors.email
                  ? "border-red-300 focus:border-red-500 focus:ring-red-200"
                  : "border-slate-200 focus:border-[#5b9a42]"
              }`}
              {...register("email")}
            />
          </div>
          {errors.email?.message && (
            <p id="email-error" className="mt-1 text-xs text-red-600 font-medium">
              {errors.email.message}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="password" className="mb-1.5 block text-xs font-semibold text-slate-700">
            Kata sandi
          </label>
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
            </div>
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="Masukkan kata sandi"
              disabled={isSubmitting}
              aria-invalid={Boolean(errors.password)}
              aria-describedby={errors.password ? "password-error" : undefined}
              className={`w-full rounded-lg border py-2.5 pl-10 pr-10 text-sm text-slate-800 placeholder-slate-400 transition-colors focus:outline-none focus:ring-2 focus:ring-[#5b9a42]/30 ${
                errors.password
                  ? "border-red-300 focus:border-red-500 focus:ring-red-200"
                  : "border-slate-200 focus:border-[#5b9a42]"
              }`}
              {...register("password")}
            />
            <button
              type="button"
              onClick={toggleShowPassword}
              disabled={isSubmitting}
              aria-label={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
              className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600 focus:outline-none focus:text-slate-600"
            >
              {showPassword ? (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18"
                  />
                </svg>
              ) : (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                  />
                </svg>
              )}
            </button>
          </div>
          {errors.password?.message && (
            <p id="password-error" className="mt-1 text-xs text-red-600 font-medium">
              {errors.password.message}
            </p>
          )}
        </div>

        <div className="flex items-center">
          <label className="flex cursor-pointer select-none items-center gap-2.5 text-xs font-medium text-slate-700">
            <input
              type="checkbox"
              id="remember-me"
              disabled={isSubmitting}
              className="h-4 w-4 rounded border-slate-300 text-[#5b9a42] accent-[#5b9a42] focus:ring-[#5b9a42]"
              {...register("rememberMe")}
            />
            <span>Ingat saya</span>
          </label>
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-lg bg-[#5b9a42] py-2.5 px-4 text-sm font-semibold text-white transition-colors hover:bg-[#4e8438] active:bg-[#437230] disabled:cursor-not-allowed disabled:opacity-60 flex items-center justify-center gap-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#5b9a42] focus:ring-offset-2"
        >
          {isSubmitting ? (
            <span>Memproses...</span>
          ) : (
            <>
              <span>Masuk</span>
              <span aria-hidden="true">&rarr;</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
}

export function LoginPage(props: UseLoginPresenterOptions = {}): React.JSX.Element {
  const sessionContext = useOptionalAuthSession();
  const navigate = useNavigate();
  const location = useLocation();

  const destination =
    (location.state as { from?: { pathname: string } })?.from?.pathname || "/upload";

  useEffect(() => {
    if (sessionContext?.isAuthenticated) {
      void navigate(destination, { replace: true });
    }
  }, [sessionContext?.isAuthenticated, navigate, destination]);

  const presenter = useLoginPresenter({
    ...props,
    onSuccess: (response, rememberMe) => {
      sessionContext?.loginSession(response, rememberMe);
      props.onSuccess?.(response, rememberMe);
      void navigate(destination, { replace: true });
    },
  });

  return (
    <main className="relative flex min-h-screen w-full items-center justify-center bg-[#f4f7f4] px-4 py-8 overflow-hidden">
      <PerkasaBackgroundDecorations />
      <PerkasaLoginForm presenter={presenter} />
    </main>
  );
}
