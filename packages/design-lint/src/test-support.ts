import { describe, it } from "node:test";
import { RuleTester } from "oxlint/plugins-dev";

// oxlint's RuleTester needs Node's raw-transfer parser, so these tests run under `node --test`.
RuleTester.describe = describe;
RuleTester.it = it;

export const ruleTester = new RuleTester({
  languageOptions: { parserOptions: { lang: "tsx" } },
});
