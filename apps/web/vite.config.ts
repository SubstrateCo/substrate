import { tanstackRouter } from "@tanstack/router-plugin/vite";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env: { SUBSTRATE_WEB_URL?: string; SUBSTRATE_API_URL?: string } = loadEnv(
    mode,
    "../..",
    "",
  );
  // The dev server serves the public web origin and proxies the API origin.
  const webURL = new URL(
    process.env.SUBSTRATE_WEB_URL ?? env.SUBSTRATE_WEB_URL ?? "http://localhost:3000",
  );
  const port = Number(webURL.port || (webURL.protocol === "https:" ? 443 : 80));
  const apiURL = process.env.SUBSTRATE_API_URL ?? env.SUBSTRATE_API_URL ?? "http://localhost:3001";
  return {
    cacheDir: process.env.VITE_CACHE_DIR,
    server: {
      port,
      strictPort: true,
      proxy: {
        "/desktop": { target: apiURL },
        "/api": { target: apiURL, ws: true },
      },
    },
    envDir: "../..",
    resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
    plugins: [
      tailwindcss(),
      tanstackRouter({ target: "react", autoCodeSplitting: true }),
      react({ compiler: true }),
    ],
  };
});
