import { configs as deslopConfigs } from "ai-deslop";
import { defineConfig } from "oxlint";

export default defineConfig({
  plugins: ["unicorn", "typescript", "oxc", "react"],
  jsPlugins: ["ai-deslop", "@shadcn/lint"],
  options: deslopConfigs.recommended.options,
  settings: {
    shadcn: {
      ui: "@/ui/primitives",
    },
  },
  rules: {
    ...deslopConfigs.recommended.rules,
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
    "deslop/canonical-class-names": ["error", { cssPath: "./apps/web/src/ui/styles.css" }],
    "deslop/no-duplicate-types": "error",
    "shadcn/no-restyle": ["error", { allow: ["layout"] }],
    "shadcn/no-raw-colors": "error",
    "shadcn/no-arbitrary-values": "error",
  },
  overrides: [
    {
      files: ["apps/web/src/ui/primitives/**"],
      rules: {
        "shadcn/no-restyle": "off",
      },
    },
    {
      files: ["apps/web/src/ui/primitives/alert.tsx"],
      rules: {
        "shadcn/no-arbitrary-values": ["error", { allow: ["grid-cols-[auto_1fr]"] }],
      },
    },
    {
      files: ["apps/web/src/ui/primitives/card.tsx"],
      rules: {
        "shadcn/no-arbitrary-values": [
          "error",
          { allow: ["grid-cols-[1fr_auto]", "grid-rows-[auto_auto]"] },
        ],
      },
    },
    {
      files: ["apps/web/src/ui/messaging/composer.tsx"],
      rules: {
        "shadcn/no-arbitrary-values": ["error", { allow: ["max-h-[25dvh]"] }],
      },
    },
    {
      files: ["apps/web/src/ui/auth/form-message.tsx"],
      rules: {
        "shadcn/no-arbitrary-values": ["error", { allow: ["max-h-[50dvh]"] }],
      },
    },
  ],
});
