import type React from "react";
import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router";
import { useLoginPresenter, type UseLoginPresenterOptions } from "./login.presenter";
import { PerkasaLogo, PerkasaBackgroundDecorations } from "./login-logo.view";
import { PerkasaLoginForm } from "./login-form.view";
import { useOptionalAuthSession } from "./auth-session.context";

export { PerkasaLogo, PerkasaBackgroundDecorations, PerkasaLoginForm };

export type LoginPageProps = UseLoginPresenterOptions & {
  navigate?: (to: string, options?: { replace?: boolean; state?: unknown }) => void;
  onPresenterReady?: (presenter: ReturnType<typeof useLoginPresenter>) => void;
};

export function LoginPage(props: LoginPageProps = {}): React.JSX.Element {
  const sessionContext = useOptionalAuthSession();
  const defaultNavigate = useNavigate();
  const navigate = props.navigate ?? defaultNavigate;
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

  props.onPresenterReady?.(presenter);

  return (
    <main className="relative flex min-h-screen w-full items-center justify-center bg-[#f4f7f4] px-4 py-8 overflow-hidden">
      <PerkasaBackgroundDecorations />
      <PerkasaLoginForm presenter={presenter} />
    </main>
  );
}
