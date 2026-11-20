import { stageInstalledPackages } from "./package-assets.ts";
import { cp, lstat, mkdir, realpath, symlink, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// ACP adapters run as their own Node processes, so they ship as real package folders.
// @modelcontextprotocol/server stays external with the ACP SDK: its fromMcpServer must get an
// McpServer from the same copy it imports, not one bundled into the worker.
const harnessWorkerExternals = [
  "@agentclientprotocol/sdk",
  "@modelcontextprotocol/sdk",
  "@modelcontextprotocol/server",
  "@agentclientprotocol/claude-agent-acp",
  "@agentclientprotocol/codex-acp",
] as const;

// The adapters' bundled agent CLIs. Substrate always launches an adapter with its cliEnv set to
// the user's CLI (inspectAgent in packages/harness-runtime/src/acp/detect.ts), and the adapters resolve these
// packages only when that variable is unset, at spawn time rather than at module load:
// - codex-acp dist/index.js:28495 and :57067 resolve @openai/codex/bin/codex.js only without
//   CODEX_PATH. Excluding @openai/codex also drops its platform binaries.
// - claude-agent-acp dist/claude-cli.js:20 returns CLAUDE_CODE_EXECUTABLE before
//   installedClaudeCliPath resolves the SDK's platform binary, and dist/v1/acp-agent.js:7682
//   and dist/v2/agent.js:880 pass that path to the SDK as pathToClaudeCodeExecutable. The SDK itself stays: the adapter
//   imports it at module load.
const harnessWorkerExcludedPackages = [
  "@openai/codex",
  "@anthropic-ai/claude-agent-sdk-darwin-arm64",
  "@anthropic-ai/claude-agent-sdk-darwin-x64",
  "@anthropic-ai/claude-agent-sdk-linux-arm64",
  "@anthropic-ai/claude-agent-sdk-linux-arm64-musl",
  "@anthropic-ai/claude-agent-sdk-linux-x64",
  "@anthropic-ai/claude-agent-sdk-linux-x64-musl",
  "@anthropic-ai/claude-agent-sdk-win32-arm64",
  "@anthropic-ai/claude-agent-sdk-win32-x64",
] as const;

export async function stageHarnessProductionAssets(outdir: string) {
  return stageInstalledPackages({
    names: harnessWorkerExternals,
    exclude: harnessWorkerExcludedPackages,
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
    entrypoints: [
      fileURLToPath(new URL("../src/harness/worker/harness-worker.ts", import.meta.url)),
    ],
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
    fileURLToPath(new URL("../../../packages/client-storage/migrations/", import.meta.url)),
    join(outdir, "client-storage-migrations"),
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
      if ((await realpath(target).catch(() => undefined)) === source) continue;
      // A link from before a dependency upgrade points at the old, maybe deleted, version.
      if (await lstat(target).catch(() => undefined)) await unlink(target);
      await symlink(source, target, process.platform === "win32" ? "junction" : "dir");
    }
  }
}

if (import.meta.main) await bundleHarnessWorker();
