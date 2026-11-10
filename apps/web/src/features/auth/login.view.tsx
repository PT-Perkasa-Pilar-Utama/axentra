import type React from "react";
import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router";
import { useLoginPresenter, type UseLoginPresenterOptions } from "./login.presenter";
import { PerkasaLogo } from "./perkasa-logo.view";
import { PerkasaBackgroundDecorations } from "./perkasa-background-decorations.view";
import { PerkasaLoginForm } from "./login-form.view";
import { useOptionalAuthSession } from "./auth-session.context";

export { PerkasaLogo, PerkasaBackgroundDecorations, PerkasaLoginForm };

export type DestinationResolver = (role: string | undefined, from: string | undefined) => string;

const DEFAULT_DESTINATION = "/dashboard";

const defaultResolveDestination: DestinationResolver = (_role, from) => from || DEFAULT_DESTINATION;

export type LoginPageProps = UseLoginPresenterOptions & {
  navigate?: (to: string, options?: { replace?: boolean; state?: unknown }) => void;
  onPresenterReady?: (presenter: ReturnType<typeof useLoginPresenter>) => void;
  resolveDestination?: DestinationResolver;
};

export function LoginPage(props: LoginPageProps = {}): React.JSX.Element {
  const sessionContext = useOptionalAuthSession();
  const defaultNavigate = useNavigate();
  const navigate = props.navigate ?? defaultNavigate;
  const location = useLocation();
  const resolveDestination = props.resolveDestination ?? defaultResolveDestination;

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname;
  const sessionDestination = resolveDestination(sessionContext?.user?.role, from);

  useEffect(() => {
    if (sessionContext?.isAuthenticated) {
      void navigate(sessionDestination, { replace: true });
    }
  }, [sessionContext?.isAuthenticated, navigate, sessionDestination]);

  const presenter = useLoginPresenter({
    ...props,
    onSuccess: (response, rememberMe) => {
      sessionContext?.loginSession(response, rememberMe);
      props.onSuccess?.(response, rememberMe);
      void navigate(resolveDestination(response.user.role, from), { replace: true });
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
