import { tanstackRouter } from "@tanstack/router-plugin/vite";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env: { WEB_PORT?: string; SERVER_URL?: string } = loadEnv(mode, "../..", "");
  const port = Number(process.env.WEB_PORT ?? env.WEB_PORT ?? "3000");
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("WEB_PORT must be a valid port.");
  return {
    cacheDir: process.env.VITE_CACHE_DIR,
    server: {
      port,
      strictPort: true,
      proxy: {
        "/api": {
          target: process.env.SERVER_URL ?? env.SERVER_URL ?? "http://localhost:3001",
          ws: true,
        },
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
