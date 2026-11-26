import pluginQuery from "@tanstack/eslint-plugin-query";
import pluginRouter from "@tanstack/eslint-plugin-router";

import contracts from "./packages/contracts/package.json" with { type: "json" };
import database from "./packages/database/package.json" with { type: "json" };
import { architectureConfig } from "./tooling/architecture-lint/src/config.ts";
import { designConfig } from "./tooling/design-lint/src/config.ts";
import { configs } from "ai-deslop";
import { defineConfig } from "oxlint";

const tanstackRecommendedRules = Object.fromEntries(
  [pluginQuery, pluginRouter]
    .flatMap((plugin) => Object.keys(plugin.configs["flat/recommended"][0]?.rules ?? {}))
    .map((rule) => [rule, "error" as const]),
);

export default defineConfig({
  ignorePatterns: [".opencode/**", "tooling/design-lint/**"],
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
    ...architectureConfig.rules,
  },
  overrides: [
    {
      files: ["apps/web/**"],
      rules: designConfig.rules,
    },
    {
      files: ["apps/web/src/**"],
      rules: {
        // Pedantic and style React rules that the correctness category does not turn on. They run
        // only on the renderer: Playwright fixtures and desktop services call unrelated `use` APIs.
        "react/rules-of-hooks": "error",
        "react/hooks": "error",
        "react/capitalized-calls": "error",
        "react/memo-dependencies": "error",
        "react/jsx-no-useless-fragment": "error",
        "react/jsx-no-target-blank": "error",
        "react/iframe-missing-sandbox": "error",
        "react/checked-requires-onchange-or-readonly": "error",
        "react/jsx-no-comment-textnodes": "error",
        "react/no-unescaped-entities": "error",
        "react/no-namespace": "error",
        "react/style-prop-object": "error",
        "react/self-closing-comp": "error",
        "react/jsx-curly-brace-presence": "error",
        "react/jsx-boolean-value": "error",
        "react/jsx-fragments": "error",
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
      // Line numbers and diff markers draw their gutter with CSS counters and generated content.
      files: ["apps/web/src/components/ui/code-block.tsx"],
      rules: {
        "shadcn/no-arbitrary-values": [
          "error",
          {
            allow: [
              "grid-cols-[auto_1fr]",
              "in-data-numbered:[counter-increment:line]",
              "content-[counter(line)]",
              "in-data-numbered:supports-[content:counter(line)/'']:before:content-[counter(line)/'']",
              "content-['+']",
              "content-['−']",
            ],
          },
        ],
      },
    },
    ...designConfig.overrides,
    ...architectureConfig.overrides,
  ],
});
