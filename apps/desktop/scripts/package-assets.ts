import { cp, mkdir, readFile, realpath } from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, dirname, isAbsolute, join, relative, sep } from "node:path";
import { z } from "zod";

const manifestSchema = z.object({
  name: z.string(),
  version: z.string(),
  dependencies: z.record(z.string(), z.string()).default({}),
  optionalDependencies: z.record(z.string(), z.string()).default({}),
  peerDependencies: z.record(z.string(), z.string()).default({}),
  peerDependenciesMeta: z
    .record(z.string(), z.object({ optional: z.boolean().optional() }))
    .default({}),
});
const packageName = z
  .string()
  .regex(/^(?:@[a-zA-Z0-9][a-zA-Z0-9._-]*\/)?[a-zA-Z0-9][a-zA-Z0-9._-]*$/);
const missingFile = z.object({ code: z.literal("ENOENT") });
const manifestIdentitySchema = z.object({ name: z.string().optional() });

async function readManifest(directory: string) {
  return manifestSchema.parse(JSON.parse(await readFile(join(directory, "package.json"), "utf8")));
}

async function packageDirectoryName(directory: string) {
  return manifestIdentitySchema.parse(
    JSON.parse(await readFile(join(directory, "package.json"), "utf8")),
  ).name;
}

/** Resolve package metadata even when its exports map hides package.json or all entries. */
async function installedPackage(name: string, fromDirectory: string): Promise<string | undefined> {
  packageName.parse(name);
  const require = createRequire(join(fromDirectory, "package.json"));
  let entry: string | undefined;
  try {
    entry = require.resolve(`${name}/package.json`);
  } catch {
    try {
      entry = require.resolve(name);
    } catch {
      /* An asset-only package can have no entry point. */
    }
  }
  if (entry) {
    for (let directory = dirname(await realpath(entry)); ;) {
      try {
        if ((await packageDirectoryName(directory)) === name) return directory;
      } catch (error) {
        if (!missingFile.safeParse(error).success) throw error;
      }
      const parent = dirname(directory);
      if (parent === directory) break;
      directory = parent;
    }
  }
  // Native optional packages can contain only binaries, with neither main nor exports.
  for (const searchPath of require.resolve.paths(name) ?? []) {
    const directory = join(searchPath, name);
    try {
      if ((await packageDirectoryName(directory)) === name) return await realpath(directory);
    } catch (error) {
      if (!missingFile.safeParse(error).success) throw error;
    }
  }
  return undefined;
}

/** Copy the installed graph, preserving package-relative CLI, native, and WASM assets. */
export async function stageInstalledPackages(options: {
  names: readonly string[];
  fromDirectory: string;
  nodeModulesDirectory: string;
}) {
  async function stage(
    name: string,
    from: string,
    nodeModules: string,
    ancestors: ReadonlySet<string>,
    optional: boolean,
  ) {
    const source = await installedPackage(name, from);
    if (!source) {
      if (optional) return;
      throw new Error(
        `Required harness dependency is not installed: ${name} (required by ${from}).`,
      );
    }
    // Node will find this exact package in an ancestor's node_modules. Do not copy a cycle.
    if (ancestors.has(source)) return;
    const destination = join(nodeModules, name);
    const pathFromSource = relative(source, destination);
    if (
      !isAbsolute(pathFromSource) &&
      pathFromSource !== ".." &&
      !pathFromSource.startsWith(`..${sep}`)
    )
      throw new Error("Package staging destination must be outside its source package.");
    const manifest = await readManifest(source);
    await mkdir(dirname(destination), { recursive: true });
    await cp(source, destination, {
      recursive: true,
      dereference: true,
      filter: (path) => basename(path) !== "node_modules",
    });
    const chain = new Set([...ancestors, source]);
    const dependencies = new Map<string, boolean>();
    for (const dependency of Object.keys(manifest.dependencies))
      dependencies.set(dependency, false);
    for (const dependency of Object.keys(manifest.peerDependencies))
      dependencies.set(
        dependency,
        dependencies.get(dependency) ??
          manifest.peerDependenciesMeta[dependency]?.optional === true,
      );
    // optionalDependencies override dependencies, as they do during package installation.
    for (const dependency of Object.keys(manifest.optionalDependencies))
      dependencies.set(dependency, true);
    for (const [dependency, isOptional] of dependencies)
      await stage(dependency, source, join(destination, "node_modules"), chain, isOptional);
  }
  const versions: Record<string, string> = {};
  for (const name of new Set(options.names)) {
    await stage(name, options.fromDirectory, options.nodeModulesDirectory, new Set(), false);
    versions[name] = (await readManifest(join(options.nodeModulesDirectory, name))).version;
  }
  return versions;
}
