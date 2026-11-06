import { fileURLToPath } from "node:url";

export async function bundlePreload(
  outdir = fileURLToPath(new URL("../.runtime/", import.meta.url)),
) {
  const result = await Bun.build({
    entrypoints: [fileURLToPath(new URL("../src/preload.ts", import.meta.url))],
    outdir,
    naming: "preload.cjs",
    target: "node",
    format: "cjs",
    external: ["electron"],
  });
  if (!result.success) throw new AggregateError(result.logs, "Desktop preload bundle failed.");
}

if (import.meta.main) await bundlePreload();
