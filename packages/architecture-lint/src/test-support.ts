import type { ArchitectureConfig } from "./layers/config.ts";
import { layerModel } from "./layers/model.ts";
import { join, resolve } from "node:path";
import { describe, it } from "node:test";
import { RuleTester } from "oxlint/plugins-dev";

// oxlint's RuleTester needs Node's raw-transfer parser, so these tests run under `node --test`.
RuleTester.describe = describe;
RuleTester.it = it;

export const ruleTester = new RuleTester({
  languageOptions: { parserOptions: { lang: "ts" } },
});

/** A fake repository root. Rules see files below it by absolute path. */
export const root = resolve("/fixture-repo");
export const at = (file: string) => join(root, file);

export const fixtureConfig: ArchitectureConfig = {
  include: ["src/**", "db/**"],
  layers: [
    { name: "route", files: ["src/**/routes.ts"] },
    { name: "service", files: ["src/**"] },
    { name: "contracts", files: ["db/contracts/**"], mayImport: [] },
    { name: "database", files: ["db/**"], specifiers: ["^@acme/db"], mayImport: ["contracts"] },
  ],
  rules: [],
};

/** A layer model over the fixture config, with the given files on disk. */
export function fixtureModel(config: ArchitectureConfig, files: string[] = []) {
  const existing = new Set(files.map(at));
  return layerModel(config, {
    root,
    isFile: (path) => existing.has(path),
    workspacePackages: new Set(["@acme/shared"]),
  });
}
