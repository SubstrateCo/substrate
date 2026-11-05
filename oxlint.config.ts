import { configs as deslopConfigs } from "ai-deslop";
import { defineConfig } from "oxlint";

export default defineConfig({
  jsPlugins: ["ai-deslop"],
  options: deslopConfigs.recommended.options,
  rules: {
    ...deslopConfigs.recommended.rules,
    "deslop/no-duplicate-types": "error",
  },
});
