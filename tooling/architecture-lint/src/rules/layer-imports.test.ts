import type { ArchitectureConfig } from "../layers/config.ts";
import { at, fixtureConfig, fixtureModel, ruleTester } from "../test-support.ts";
import { layerImports } from "./layer-imports.ts";

const config: ArchitectureConfig = {
  ...fixtureConfig,
  rules: [
    {
      id: "R1",
      tag: "bypass",
      layer: "route",
      forbidImports: ["database", "3p:drizzle-orm"],
      message: "route imports {target} ({match})",
      fix: "Call a service method.",
    },
    {
      id: "R5",
      tag: "vendor",
      layer: "route",
      forbidImports: ["/^3p:(?!hono$)/"],
      message: "route imports third-party {target}",
      fix: "Wrap the SDK in an adapter",
    },
    {
      id: "S1",
      tag: "upward",
      layer: "service",
      forbidImports: ["3p:hono"],
      allowTypeOnly: true,
      message: "service imports {target}",
      fix: "Keep HTTP types in routes",
    },
  ],
  exceptions: [{ rule: "R1", files: ["src/legacy/routes.ts"], reason: "Migrating." }],
};
const model = fixtureModel(config, ["src/v1/tasks/service.ts", "db/contracts/task.ts"]);
const route = at("src/v1/tasks/routes.ts");
const service = at("src/v1/tasks/service.ts");
const database = at("db/tasks.ts");

ruleTester.run("layer-imports", layerImports(config, model), {
  valid: [
    { code: 'import { Hono } from "hono";', filename: route },
    { code: 'import type { Context } from "hono";', filename: service },
    { code: 'import { type Context } from "hono";', filename: service },
    { code: 'import { id } from "@acme/shared";', filename: route },
    { code: 'import { db } from "@acme/db";', filename: at("src/legacy/routes.ts") },
    { code: 'import { db } from "@acme/db";', filename: at("scripts/seed.ts") },
    { code: 'import { task } from "./contracts/task";', filename: database },
  ],
  invalid: [
    {
      code: 'import { db } from "@acme/db";',
      filename: route,
      errors: [{ message: "[R1] route imports database (@acme/db). Call a service method." }],
    },
    {
      code: 'import { eq } from "drizzle-orm";',
      filename: route,
      errors: [
        { message: "[R1] route imports 3p:drizzle-orm (drizzle-orm). Call a service method." },
        { message: "[R5] route imports third-party 3p:drizzle-orm. Wrap the SDK in an adapter." },
      ],
    },
    {
      code: 'import { Hono } from "hono";',
      filename: service,
      errors: [{ message: "[S1] service imports 3p:hono. Keep HTTP types in routes." }],
    },
    {
      code: 'export * from "@acme/db";\nconst lazy = () => import("@acme/db");',
      filename: route,
      errors: [
        { message: "[R1] route imports database (@acme/db). Call a service method." },
        { message: "[R1] route imports database (@acme/db). Call a service method." },
      ],
    },
    {
      code: 'import type { TaskService } from "../src/v1/tasks/service";',
      filename: database,
      errors: [
        {
          message:
            "[X3] database imports service (../src/v1/tasks/service); it may import only contracts. Invert the dependency, or move the shared code to a layer both may import.",
        },
      ],
    },
  ],
});
