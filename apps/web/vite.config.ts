import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const envDir = fileURLToPath(new URL("../../", import.meta.url));
// Same value as DEFAULT_WEB_ORIGIN in packages/config. That package is not imported here:
// Vite runs this config through Node's native ESM loader, which cannot load its extensionless .ts sources.
const DEFAULT_WEB_ORIGIN = "http://localhost:5173";

// Host name of WEB_ORIGIN, with the same rules the API applies (http or https, with a host name).
// The message does not echo the value, in case a malformed URL carries credentials.
function publicHostOf(origin: string): string {
  const invalid = new Error("WEB_ORIGIN must be an absolute http or https URL with a host name");
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    throw invalid;
  }
  const isWebScheme = url.protocol === "http:" || url.protocol === "https:";
  if (!isWebScheme || url.hostname === "" || url.hostname.startsWith(".")) {
    throw invalid;
  }
  return url.hostname;
}

export default defineConfig(({ mode }) => {
  // WEB_ORIGIN is the public origin of this app, the same value the API allows for CORS.
  // `vite preview` accepts that Host header so a reverse proxy in front of it works.
  // Other hostnames still get 403; localhost and IP-literal hosts stay allowed by Vite.
  const webOrigin = loadEnv(mode, envDir, "WEB_ORIGIN").WEB_ORIGIN || DEFAULT_WEB_ORIGIN;

  return {
    envDir,
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        "/api": {
          target: "http://localhost:3001",
          changeOrigin: true,
        },
      },
    },
    preview: {
      allowedHosts: [publicHostOf(webOrigin)],
    },
  };
});
