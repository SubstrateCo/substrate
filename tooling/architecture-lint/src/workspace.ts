import { type ArchitectureConfig, configProblems } from "./layers/config.ts";
import type { Workspace } from "./layers/model.ts";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));

interface Manifest {
  name?: string;
  workspaces?: string[];
}

function readManifest(path: string): Manifest {
  // SAFETY: package.json files in this repository are written by Bun and checked by its install.
  return JSON.parse(readFileSync(path, "utf8")) as Manifest;
}

function workspacePackages(root: string) {
  const names = new Set<string>();
  for (const pattern of readManifest(join(root, "package.json")).workspaces ?? []) {
    const parent = join(root, pattern.replace(/\/\*$/, ""));
    if (!existsSync(parent)) continue;
    for (const entry of readdirSync(parent, { withFileTypes: true })) {
      const path = join(parent, entry.name, "package.json");
      if (!entry.isDirectory() || !existsSync(path)) continue;
      const { name } = readManifest(path);
      if (name) names.add(name);
    }
  }
  return names;
}

interface Architecture {
  config: ArchitectureConfig;
  workspace: Workspace;
}

export function loadArchitecture(root = repositoryRoot): Architecture {
  const configPath = join(root, "architecture.config.json");
  // SAFETY: configProblems below rejects unknown fields, layers, and rule IDs before any rule runs.
  const config = JSON.parse(readFileSync(configPath, "utf8")) as ArchitectureConfig;
  const problems = configProblems(config);
  if (problems.length)
    throw new Error(`${configPath} has problems:\n${problems.map((p) => `- ${p}`).join("\n")}`);
  return {
    config,
    workspace: {
      root: resolve(root, config.root ?? "."),
      isFile: (path) => existsSync(path) && statSync(path).isFile(),
      workspacePackages: workspacePackages(root),
    },
  };
}
