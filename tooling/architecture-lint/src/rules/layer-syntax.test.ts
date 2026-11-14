import type { ArchitectureConfig } from "../layers/config.ts";
import { at, fixtureConfig, fixtureModel, ruleTester } from "../test-support.ts";
import { layerSyntax } from "./layer-syntax.ts";

const config: ArchitectureConfig = {
  ...fixtureConfig,
  rules: [
    {
      id: "R3",
      tag: "validate",
      layer: "route",
      forbidCalls: ["*.req.{json,query}"],
      message: "route reads raw request input (`{match}`)",
      fix: "Validate with v(target, schema)",
    },
    {
      id: "R4",
      tag: "sanitize",
      layer: "route",
      forbidNew: ["Response"],
      forbidSyntax: ["CatchClause"],
      message: "route shapes the response itself (`{match}`)",
      fix: "Return a ServiceResult",
    },
    {
      id: "R1",
      tag: "bypass",
      layer: "route",
      forbidMembers: ["repositories.*"],
      message: "route uses persistence directly (`{match}`)",
      fix: "Move the call into a service method",
    },
    {
      id: "D1",
      tag: "validate",
      layer: "database",
      forbidCalls: ["**.safeParse", "*{Schema,Input}.parse"],
      message: "database parses input (`{match}`)",
      fix: "Accept typed values",
    },
  ],
};
const model = fixtureModel(config);
const route = at("src/v1/tasks/routes.ts");
const database = at("db/tasks.ts");

ruleTester.run("layer-syntax", layerSyntax(config, model), {
  valid: [
    { code: 'const body = c.req.valid("json");', filename: route },
    // Strings and comments are not code.
    { code: 'const note = "c.req.json()"; // await c.req.json()', filename: route },
    // The rule applies only to its layer.
    { code: "const body = await c.req.json();", filename: at("src/v1/tasks/service.ts") },
    { code: "const row = taskRow.parse(value);", filename: database },
  ],
  invalid: [
    {
      code: "const body = await c.req.json();",
      filename: route,
      errors: [
        {
          message:
            "[R3] route reads raw request input (`c.req.json`). Validate with v(target, schema).",
        },
      ],
    },
    {
      // A call that spans lines is one path.
      code: 'const q = c.req\n  .query("a");',
      filename: route,
      errors: [
        {
          line: 1,
          message:
            "[R3] route reads raw request input (`c.req.query`). Validate with v(target, schema).",
        },
      ],
    },
    {
      code: 'try { run(); } catch { return new Response("x"); }',
      filename: route,
      errors: [
        {
          message: "[R4] route shapes the response itself (`CatchClause`). Return a ServiceResult.",
        },
        { message: "[R4] route shapes the response itself (`Response`). Return a ServiceResult." },
      ],
    },
    {
      // Only the `repositories.agents` member matches, not the longer chain around it.
      code: "await repositories.agents.list();",
      filename: route,
      errors: [
        {
          message:
            "[R1] route uses persistence directly (`repositories.agents`). Move the call into a service method.",
        },
      ],
    },
    {
      code: "z.object({}).safeParse(input);\nTaskInput.parse(input);",
      filename: database,
      errors: [
        { message: "[D1] database parses input (`().safeParse`). Accept typed values." },
        { message: "[D1] database parses input (`TaskInput.parse`). Accept typed values." },
      ],
    },
  ],
});
