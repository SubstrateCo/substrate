import { configs as deslopConfigs } from "ai-deslop";
import { defineConfig } from "oxlint";

export default defineConfig({
  jsPlugins: ["ai-deslop", "@shadcn/lint"],
  options: deslopConfigs.recommended.options,
  settings: {
    shadcn: {
      ui: "@startup-os/ui/primitives",
    },
  },
  rules: {
    ...deslopConfigs.recommended.rules,
    "no-nested-ternary": "error",
    "deslop/canonical-class-names": ["error", { cssPath: "./packages/ui/src/styles.css" }],
    "deslop/no-duplicate-types": "error",
    "shadcn/no-restyle": ["error", { allow: ["layout"] }],
    "shadcn/no-raw-colors": "error",
    "shadcn/no-arbitrary-values": "error",
  },
  overrides: [
    {
      files: ["packages/ui/src/primitives/**"],
      rules: {
        "shadcn/no-restyle": "off",
      },
    },
    {
      files: ["packages/ui/src/primitives/alert.tsx"],
      rules: {
        "shadcn/no-arbitrary-values": ["error", { allow: ["grid-cols-[auto_1fr]"] }],
      },
    },
    {
      files: ["packages/ui/src/primitives/card.tsx"],
      rules: {
        "shadcn/no-arbitrary-values": [
          "error",
          { allow: ["grid-cols-[1fr_auto]", "grid-rows-[auto_auto]"] },
        ],
      },
    },
    {
      files: ["packages/ui/src/messaging/composer.tsx"],
      rules: {
        "shadcn/no-arbitrary-values": ["error", { allow: ["max-h-[25dvh]"] }],
      },
    },
    {
      files: ["packages/ui/src/auth/form-message.tsx"],
      rules: {
        "shadcn/no-arbitrary-values": ["error", { allow: ["max-h-[50dvh]"] }],
      },
    },
  ],
});
