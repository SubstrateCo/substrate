import type { OwnedInsertsOptions } from "./rules/owned-inserts.ts";
import type { OxlintConfig } from "oxlint";

const ownedTables: OwnedInsertsOptions = {
  tables: {
    inbox: {
      files: ["packages/client-storage/src/agent-work/enqueue.ts"],
      use: "`enqueue()` in packages/client-storage/src/agent-work/enqueue.ts, which takes the lane from the trigger registry",
    },
    agentWakes: {
      files: ["packages/database/src/features/agent-work/admission.ts"],
      use: "`admit()` in packages/database/src/features/agent-work/admission.ts, which applies `decideAdmission`",
    },
  },
};

const TESTS = ["**/*.test.ts", "**/test-support.ts", "**/testing/**"];

/**
 * Architecture lint: layer rules from `architecture.config.json`, plus the AGENTS.md rules
 * for agent-work state and adapter capabilities. Paths are relative to the repository root.
 */
export const architectureConfig = {
  jsPlugins: [{ name: "architecture", specifier: "./packages/architecture-lint/src/index.ts" }],
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
      // Every status in agent work belongs to a machine; elsewhere only machine writes are checked.
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
