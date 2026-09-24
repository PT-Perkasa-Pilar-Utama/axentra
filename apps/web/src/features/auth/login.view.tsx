import type React from "react";
import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router";
import { useLoginPresenter, type UseLoginPresenterOptions } from "./login.presenter";
import { PerkasaLogo, PerkasaBackgroundDecorations } from "./login-logo.view";
import { PerkasaLoginForm } from "./login-form.view";
import { useOptionalAuthSession } from "./auth-session.context";

export { PerkasaLogo, PerkasaBackgroundDecorations, PerkasaLoginForm };

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
