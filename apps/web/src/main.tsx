import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router";
import { router } from "./app/router";
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
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
