import type { OxlintConfig } from "oxlint";

const MOBILE = "apps/mobile";

export const mobileConfig = {
  jsPlugins: [{ name: "mobile", specifier: "./tooling/mobile-lint/src/index.ts" }],
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
        "mobile/native-boundaries": "error",
        "mobile/no-raw-colors": "error",
        "mobile/icon-button-name": "error",
        "mobile/use-primitives": "error",
      },
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
