import type { KnipConfig } from "knip";

export default {
  workspaces: {
    ".": {
      entry: [],
      project: ["*.{js,ts}", ".railway/*.ts"],
      // oxlint's type-aware linting uses it; no source file imports it.
      ignoreDependencies: ["tsrs"],
    },
    "apps/desktop": {
      // Bun's custom bundlers and Electron load these outside the import graph.
      entry: ["src/preload.ts", "src/overlay-preload.ts", "src/harness/worker/harness-worker.ts"],
      project: ["src/**/*.{js,ts}", "scripts/**/*.{js,ts}"],
      ignoreDependencies: ["sdk"],
    },
    "apps/server": {
      // Runtime scripts and the public API export are discovered from package.json.
      entry: ["{src,scripts}/**/*.test.ts", "scripts/seed-calendar-e2e.ts"],
      project: ["src/**/*.{ts,tsx}", "scripts/**/*.ts", "integration/**/*.ts", "*.config.ts"],
      bun: true,
    },
    "apps/web": {
      // Vite, TanStack Router, and Playwright discover renderer and test entries.
      entry: ["e2e/test-support/screenshots.ts"],
      project: ["src/**/*.{ts,tsx,css}", "e2e/**/*.ts", "scripts/**/*.ts", "*.config.ts"],
      // Vendored shadcn components retain their upstream exports.
      ignore: ["src/components/ui/**"],
    },
    "apps/mobile": {
      // Metro picks `.web` files over their native siblings when it bundles for web.
      // NativeWind's Metro wrapper reads tailwind.config from the working directory, so knip
      // cannot load metro.config.js as a plugin; it reads its imports as an entry instead.
      entry: ["src/**/*.web.{ts,tsx}", "metro.config.js"],
      project: ["src/**/*.{ts,tsx}", "e2e/**/*.ts", "scripts/**/*.ts", "*.config.{js,ts}", "*.css"],
      metro: false,
      // Vendored React Native Reusables components retain their upstream exports.
      ignore: ["src/components/ui/**"],
      ignoreDependencies: [
        // babel.config.js resolves NativeWind's Babel plugins from this app at runtime.
        "react-native-css-interop",
        "@babel/plugin-transform-react-jsx",
        // Knip's Expo plugin assumes OTA updates; this app does not use them.
        "expo-updates",
      ],
    },
    // Package entry points come from each package.json exports map.
    "packages/agent-avatars": {
      project: ["src/**/*.{ts,tsx}", "playground/**/*.{ts,tsx}"],
    },
    "packages/agent-host": {
      entry: [],
      project: ["src/**/*.ts"],
    },
    "packages/client-storage": {
      entry: ["src/mail/list-worker-entry.ts"],
      project: ["src/**/*.ts", "*.config.ts"],
    },
    "packages/contracts": {
      entry: [],
      project: ["src/**/*.{js,ts}"],
    },
    "packages/database": {
      entry: ["src/**/*.test.ts"],
      project: ["src/**/*.ts", "*.config.ts"],
      bun: true,
    },
    "tooling/architecture-lint": {
      entry: ["src/**/*.test.ts"],
      project: ["src/**/*.ts"],
    },
    "tooling/design-lint": {
      entry: ["src/**/*.test.ts"],
      project: ["src/**/*.ts"],
    },
    "packages/harness-runtime": {
      entry: [],
      project: ["src/**/*.ts"],
      ignoreDependencies: [
        "@agentclientprotocol/claude-agent-acp",
        "@agentclientprotocol/codex-acp",
      ],
    },
  },
} satisfies KnipConfig;
