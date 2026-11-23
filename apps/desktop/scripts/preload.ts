import { bundleHarnessWorker } from "./harness-worker.ts";
import { fileURLToPath } from "node:url";

const preloads = { "preload.ts": "preload.cjs", "overlay-preload.ts": "overlay-preload.cjs" };

export async function bundlePreload(
  outdir = fileURLToPath(new URL("../.runtime/", import.meta.url)),
) {
  for (const [entry, naming] of Object.entries(preloads)) {
    const result = await Bun.build({
      entrypoints: [fileURLToPath(new URL(`../src/${entry}`, import.meta.url))],
      outdir,
      naming,
      target: "node",
      format: "cjs",
      external: ["electron"],
    });
    if (!result.success) throw new AggregateError(result.logs, "Desktop preload bundle failed.");
  }
}

if (import.meta.main) {
  await bundlePreload();
  await bundleHarnessWorker();
}
