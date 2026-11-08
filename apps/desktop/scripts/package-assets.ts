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
  const top = options.nodeModulesDirectory;
  // For each node_modules directory, the package source that Node resolves for a name from there.
  const visible = new Map<string, Map<string, string>>();
  function reserve(directories: readonly string[], name: string, source: string) {
    for (const directory of directories) {
      const names = visible.get(directory) ?? new Map<string, string>();
      names.set(name, source);
      visible.set(directory, names);
    }
  }
  /**
   * Choose where Node will resolve a dependency and return its pending copy, if one is needed.
   * @param chain node_modules directories that Node searches, nearest first.
   */
  async function stage(
    name: string,
    from: string,
    chain: readonly string[],
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
    const found = chain.findIndex((directory) => visible.get(directory)?.has(name));
    if (found !== -1 && visible.get(chain[found])?.get(name) === source) {
      reserve(chain.slice(0, found), name, source);
      return;
    }
    // Hoist as high as possible, below the nearest different version.
    const level = found === -1 ? chain.length - 1 : found - 1;
    if (level < 0) throw new Error(`Conflicting harness dependency versions: ${name}.`);
    reserve(chain.slice(0, level + 1), name, source);
    return () => install(name, source, chain.slice(level), ancestors);
  }
  async function install(
    name: string,
    source: string,
    chain: readonly string[],
    ancestors: ReadonlySet<string>,
  ) {
    const destination = join(chain[0], name);
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
    const lineage = new Set([...ancestors, source]);
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
    // Place all direct dependencies before their own dependencies can hoist through this level.
    const pending: (() => Promise<string>)[] = [];
    for (const [dependency, isOptional] of dependencies) {
      const copy = await stage(
        dependency,
        source,
        [join(destination, "node_modules"), ...chain],
        lineage,
        isOptional,
      );
      if (copy) pending.push(copy);
    }
    for (const copy of pending) await copy();
    return manifest.version;
  }
  // Reserve every top-level package first so a dependency cannot take its place.
  const roots = new Map<string, string>();
  for (const name of new Set(options.names)) {
    const source = await installedPackage(name, options.fromDirectory);
    if (!source)
      throw new Error(
        `Required harness dependency is not installed: ${name} (required by ${options.fromDirectory}).`,
      );
    roots.set(name, source);
    reserve([top], name, source);
  }
  const versions: Record<string, string> = {};
  for (const [name, source] of roots)
    versions[name] = await install(name, source, [top], new Set());
  return versions;
}
