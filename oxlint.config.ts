import pluginQuery from "@tanstack/eslint-plugin-query";
import pluginRouter from "@tanstack/eslint-plugin-router";

import { architectureConfig } from "./packages/architecture-lint/src/config.ts";
import contracts from "./packages/contracts/package.json" with { type: "json" };
import database from "./packages/database/package.json" with { type: "json" };
import { designConfig } from "./packages/design-lint/src/config.ts";
import { configs } from "ai-deslop";
import { defineConfig } from "oxlint";

const tanstackRecommendedRules = Object.fromEntries(
  [pluginQuery, pluginRouter]
    .flatMap((plugin) => Object.keys(plugin.configs["flat/recommended"][0]?.rules ?? {}))
    .map((rule) => [rule, "error" as const]),
);

export default defineConfig({
  ignorePatterns: [".opencode/**", "packages/design-lint/**"],
  plugins: ["unicorn", "typescript", "oxc", "react"],
  jsPlugins: [
    "ai-deslop",
    "@shadcn/lint",
    "@tanstack/eslint-plugin-query",
    "@tanstack/eslint-plugin-router",
    ...designConfig.jsPlugins,
    ...architectureConfig.jsPlugins,
  ],
  options: configs.recommended.options,
  settings: designConfig.settings,
  rules: {
    ...configs.recommended.rules,
    ...tanstackRecommendedRules,
    "react/error-boundaries": "error",
    "react/globals": "error",
    "react/immutability": "error",
    "react/incompatible-library": "error",
    "react/preserve-manual-memoization": "error",
    "react/purity": "error",
    "react/refs": "error",
    "react/set-state-in-effect": "error",
    "react/set-state-in-render": "error",
    "react/static-components": "error",
    "react/unsupported-syntax": "error",
    "react/use-memo": "error",
    "react/void-use-memo": "error",
    "no-nested-ternary": "error",
    "deslop/canonical-class-names": ["error", { cssPath: "./apps/web/src/components/styles.css" }],
    "deslop/no-duplicate-types": [
      "error",
      {
        schemas: { libraries: ["zod"], matchTypes: true },
        drizzle: { models: ["select", "insert"], matchTypes: true },
      },
    ],
    "deslop/no-pass-through-schema": ["error", { libraries: ["zod"] }],
    "deslop/no-renamed-imports": "error",
    "deslop/no-reexports-outside-entrypoints": [
      "error",
      {
        entrypoints: [
          "**/index.ts",
          "apps/server/src/app.ts",
          ...Object.values(contracts.exports).map(
            (entry) => `packages/contracts/${entry.slice(2)}`,
          ),
          ...Object.values(database.exports).map((entry) => `packages/database/${entry.slice(2)}`),
        ],
      },
    ],
    "deslop/max-boolean-conditions": ["error", { maxConditions: 3 }],
    ...designConfig.rules,
    ...architectureConfig.rules,
  },
  overrides: [
    {
      files: ["apps/web/src/**"],
      rules: {
        "no-restricted-properties": [
          "error",
          ...[
            "substrateHarness",
            "substrateAgentWork",
            "substrateWindow",
            "substrateDesktopSettings",
            "substrateRealtime",
          ].map((property) => ({
            object: "window",
            property,
            message: "Use lib/desktop/bridges.ts.",
          })),
        ],
      },
    },
    {
      files: ["apps/web/src/lib/desktop/bridges.ts"],
      rules: { "no-restricted-properties": "off" },
    },
    {
      files: [
        "apps/web/src/components/ui/input.tsx",
        "apps/web/src/components/ui/textarea.tsx",
        "apps/web/src/components/ui/select.tsx",
      ],
      rules: {
        "shadcn/no-arbitrary-values": [
          "error",
          { allow: ["transition-[border-color,box-shadow]"] },
        ],
      },
    },
    {
      files: ["apps/web/src/components/ui/**"],
      rules: {
        "shadcn/no-restyle": "off",
      },
    },
    {
      files: ["apps/web/src/components/ui/alert.tsx"],
      rules: {
        "shadcn/no-arbitrary-values": ["error", { allow: ["grid-cols-[auto_1fr]"] }],
      },
    },
    {
      files: ["apps/web/src/components/ui/card.tsx"],
      rules: {
        "shadcn/no-arbitrary-values": [
          "error",
          { allow: ["grid-cols-[1fr_auto]", "grid-rows-[auto_auto]"] },
        ],
      },
    },
    {
      files: ["apps/web/src/components/messaging/composer/composer-view.tsx"],
      rules: {
        "shadcn/no-arbitrary-values": ["error", { allow: ["max-h-[25dvh]"] }],
      },
    },
    {
      files: ["apps/web/src/components/auth/form-message.tsx"],
      rules: {
        "shadcn/no-arbitrary-values": ["error", { allow: ["max-h-[50dvh]"] }],
      },
    },
    ...designConfig.overrides,
    ...architectureConfig.overrides,
  ],
});
