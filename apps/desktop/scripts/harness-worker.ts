import { stageInstalledPackages } from "./package-assets.ts";
import { cp, lstat, mkdir, realpath, symlink, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const harnessWorkerExternals = [
  "@agentclientprotocol/sdk",
  "@anthropic-ai/claude-agent-sdk",
  "@modelcontextprotocol/sdk",
  "@opencode/client",
  "jsonc-parser",
  "smol-toml",
] as const;

export async function stageHarnessProductionAssets(outdir: string) {
  return stageInstalledPackages({
    names: harnessWorkerExternals,
    fromDirectory: fileURLToPath(new URL("../../../packages/harness-runtime/", import.meta.url)),
    nodeModulesDirectory: join(outdir, "node_modules"),
  });
}

export async function writeHarnessWorkerLoader(outdir: string) {
  // Start external SDKs from real files, not ASAR virtual paths, so native child processes
  // can use package-relative executables and assets without temporary extraction.
  await writeFile(
    join(outdir, "harness-worker.js"),
    [
      'import { fileURLToPath, pathToFileURL } from "node:url";',
      'const physical = fileURLToPath(import.meta.url).replace(/([\\\\/])app\\.asar([\\\\/])/, "$1app.asar.unpacked$2");',
      'await import(new URL("./harness-worker-entry.mjs", pathToFileURL(physical)).href);',
      "",
    ].join("\n"),
  );
}

export async function bundleHarnessWorker(
  outdir = fileURLToPath(new URL("../.runtime/", import.meta.url)),
) {
  const result = await Bun.build({
    entrypoints: [fileURLToPath(new URL("../src/harness-worker.ts", import.meta.url))],
    outdir,
    naming: "harness-worker-entry.mjs",
    target: "node",
    format: "esm",
    // Native SDKs resolve their own companion executables/assets relative to their modules.
    external: [...harnessWorkerExternals],
  });
  if (!result.success)
    throw new AggregateError(result.logs, "Desktop harness worker bundle failed.");
  await writeHarnessWorkerLoader(outdir);
  await cp(
    fileURLToPath(new URL("../../../packages/harness-runtime/migrations/", import.meta.url)),
    join(outdir, "harness-migrations"),
    { recursive: true },
  );
  const developmentDirectory = fileURLToPath(new URL("../.runtime/", import.meta.url));
  if (resolve(outdir) === resolve(developmentDirectory)) {
    const dependencies = fileURLToPath(
      new URL("../../../packages/harness-runtime/node_modules/", import.meta.url),
    );
    const destination = join(outdir, "node_modules");
    const existing = await lstat(destination).catch(() => undefined);
    if (existing?.isSymbolicLink()) {
      if ((await realpath(destination)) !== (await realpath(dependencies)))
        throw new Error("Unexpected development dependencies link.");
      await unlink(destination);
    }
    await mkdir(destination, { recursive: true });
    // Link resolved package roots individually: a junction around Bun's node_modules
    // changes how its relative package links resolve on Windows.
    for (const name of harnessWorkerExternals) {
      const source = await realpath(join(dependencies, name));
      const target = join(destination, name);
      await mkdir(dirname(target), { recursive: true });
      try {
        await symlink(source, target, process.platform === "win32" ? "junction" : "dir");
      } catch (error) {
        if ((await realpath(target)) !== source) throw error;
      }
    }
  }
}

if (import.meta.main) await bundleHarnessWorker();
