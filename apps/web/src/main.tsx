import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router";
import { router } from "./app/router";
import { AuthSessionProvider } from "./features/auth/auth-session.context";
import { SessionBootstrapGate } from "./features/auth/session-loading.view";
import "./styles.css";

const rootElement = document.getElementById("root");
if (rootElement === null) throw new Error("Root element is unavailable");

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15000,
      refetchOnWindowFocus: false,
    },
  },
});

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthSessionProvider
        onUnauthorized={(currentPath) => {
          void router.navigate("/login", {
            state: { from: { pathname: currentPath || "/" } },
            replace: true,
          });
        }}
      >
        <SessionBootstrapGate>
          <RouterProvider router={router} />
        </SessionBootstrapGate>
      </AuthSessionProvider>
    </QueryClientProvider>
  </StrictMode>,
);
