import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, "../..", "");
  for (const [key, value] of Object.entries(env)) {
    process.env[key] ??= value;
  }
  return {
    server: { port: 3000, strictPort: true },
    envDir: "../..",
    resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
    plugins: [tailwindcss(), tanstackStart(), react()],
  };
});
