import type { OwnedInsertsOptions } from "./rules/owned-inserts.ts";
import type { OxlintConfig } from "oxlint";

const ownedTables: OwnedInsertsOptions = {
  tables: {
    inbox: {
      files: ["packages/client-storage/src/agent-work/enqueue.ts"],
      use: "`enqueue()` in packages/client-storage/src/agent-work/enqueue.ts, which takes the lane from the trigger registry",
    },
    agentWakes: {
      files: ["packages/database/src/features/agent-work/wakes/admission.ts"],
      use: "`admit()` in packages/database/src/features/agent-work/wakes/admission.ts, which applies `decideAdmission`",
    },
  },
};

const TESTS = ["**/*.test.ts", "**/test-support.ts", "**/testing/**"];

export const architectureConfig = {
  jsPlugins: [{ name: "architecture", specifier: "./tooling/architecture-lint/src/index.ts" }],
  rules: {
    "architecture/layer-imports": "error",
    "architecture/layer-syntax": "error",
  },
  overrides: [
    {
      files: ["packages/database/src/**", "packages/client-storage/src/**"],
      rules: {
        "architecture/machine-transitions": "error",
        "architecture/owned-inserts": ["error", ownedTables],
      },
    },
    {
      files: [
        "packages/database/src/features/agent-work/**",
        "packages/client-storage/src/agent-work/**",
      ],
      rules: { "architecture/machine-transitions": ["error", { allStatusWrites: true }] },
    },
    {
      files: TESTS,
      rules: {
        "architecture/machine-transitions": "off",
        "architecture/owned-inserts": "off",
      },
    },
    {
      files: ["packages/harness-runtime/src/adapters/**"],
      rules: { "architecture/capability-citations": "error" },
    },
  ],
} satisfies Pick<OxlintConfig, "jsPlugins" | "rules" | "overrides">;
