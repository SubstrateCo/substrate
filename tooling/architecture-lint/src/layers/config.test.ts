import { fixtureConfig } from "../test-support.ts";
import { configProblems, type LayerRule } from "./config.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

const rule: LayerRule = {
  id: "R1",
  tag: "bypass",
  layer: "route",
  forbidImports: ["database"],
  message: "route imports {target}",
  fix: "Call a service",
};

void test("a valid config has no problems", () => {
  assert.deepEqual(configProblems({ ...fixtureConfig, rules: [rule] }), []);
});

void test("config mistakes that would silently turn a rule off are problems", () => {
  const problems = configProblems({
    ...fixtureConfig,
    layers: [...fixtureConfig.layers, { name: "worker", files: ["jobs/**"], mayImport: ["queue"] }],
    rules: [
      // A misspelled check field leaves the rule with no checks.
      // SAFETY: the extra field is the misspelling under test; the type cannot express it.
      { ...rule, forbidImports: undefined, forbidPattern: ["x"] } as LayerRule,
      { ...rule, id: "R9", layer: "routes" },
      { ...rule, id: "R8", forbidImports: ["routes"] },
    ],
    exceptions: [
      { rule: "R7", files: ["src/**"], reason: "Old code." },
      { rule: "R1", files: ["src/**"] },
    ],
  });
  assert.deepEqual(problems, [
    'layers[4] (worker): mayImport names unknown layer "queue"',
    'rules[0] (R1): unknown field "forbidPattern"',
    "rules[0] (R1): needs one of forbidImports, forbidCalls, forbidNew, forbidMembers, forbidSyntax",
    'rules[1] (R9): unknown layer "routes"',
    'rules[2] (R8): forbidImports entry "routes" is not a layer, a target label, or a /regex/',
    'exceptions[0]: unknown rule "R7"',
    "exceptions[1]: needs a reason",
  ]);
});
