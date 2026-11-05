import { configs as deslopConfigs } from "ai-deslop";
import { defineConfig } from "oxlint";

export default defineConfig({
  jsPlugins: ["ai-deslop"],
  options: deslopConfigs.recommended.options,
  rules: {
    ...deslopConfigs.recommended.rules,
    "deslop/canonical-class-names": ["error", { cssPath: "./packages/ui/src/styles.css" }],
    "deslop/no-duplicate-types": "error",
  },
});
