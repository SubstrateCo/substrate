import type { OxlintConfig } from "oxlint";

const MOBILE = "apps/mobile";

export const mobileConfig = {
  jsPlugins: [
    "eslint-plugin-react-native",
    { name: "mobile", specifier: "./tooling/mobile-lint/src/index.ts" },
  ],
  overrides: [
    {
      // Expo configuration and Metro run in Node; only app code has native runtime boundaries.
      files: [
        `${MOBILE}/src/**`,
        `${MOBILE}/app/**`,
        `${MOBILE}/components/**`,
        `${MOBILE}/lib/**`,
      ],
      rules: {
        "react-native/no-unused-styles": "error",
        // These components render their string children through native Text primitives.
        "react-native/no-raw-text": [
          "error",
          { skip: ["Notice", "ComposerNotice", "DialogTitle", "DialogDescription"] },
        ],
        "react-native/no-single-element-style-arrays": "error",
        "react-native/split-platform-components": "error",
        "react/rules-of-hooks": "error",
        "react/hooks": "error",
        "react/capitalized-calls": "error",
        "react/memo-dependencies": "error",
        "react/no-unstable-nested-components": "error",
        "react/exhaustive-effect-dependencies": "error",
        // Expression wrappers can preserve a single element for asChild primitives.
        "react/jsx-no-useless-fragment": ["error", { allowExpressions: true }],
        "react/jsx-no-comment-textnodes": "error",
        "react/no-unescaped-entities": "error",
        "react/no-namespace": "error",
        "react/self-closing-comp": "error",
        "react/jsx-curly-brace-presence": "error",
        "react/jsx-boolean-value": "error",
        "react/jsx-fragments": "error",
        "mobile/native-boundaries": "error",
        "mobile/no-raw-colors": "error",
        "mobile/icon-button-name": "error",
        "mobile/use-primitives": "error",
      },
    },
    {
      // Browser-only implementations render DOM text, not native Text nodes.
      files: [`${MOBILE}/**/*.web.tsx`],
      rules: { "react-native/no-raw-text": "off" },
    },
    {
      files: [
        `${MOBILE}/src/components/ui/**`,
        `${MOBILE}/src/components/gestures/**`,
        `${MOBILE}/src/components/editor/**`,
        `${MOBILE}/components/ui/**`,
        `${MOBILE}/components/gestures/**`,
        `${MOBILE}/components/editor/**`,
      ],
      rules: { "mobile/use-primitives": "off" },
    },
    {
      files: [
        `${MOBILE}/src/lib/theme.ts`,
        `${MOBILE}/src/lib/theme/**`,
        `${MOBILE}/src/theme/navigation.ts`,
        `${MOBILE}/lib/theme.ts`,
        `${MOBILE}/lib/theme/**`,
        `${MOBILE}/src/lib/tokens/generated/**`,
      ],
      rules: { "mobile/no-raw-colors": "off" },
    },
    {
      // Unit tests run in Node or Bun, not in the shipped native runtime.
      files: [`${MOBILE}/**/*.test.ts`, `${MOBILE}/**/*.test.tsx`],
      rules: { "mobile/native-boundaries": "off" },
    },
  ],
} satisfies Pick<OxlintConfig, "jsPlugins" | "overrides">;
