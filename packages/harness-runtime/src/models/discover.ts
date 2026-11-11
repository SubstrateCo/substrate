import {
  harnessModelCatalogSchema,
  type HarnessKind,
  type HarnessModelCatalog,
} from "@substrate/contracts/harness";

import { resolveExecutable } from "../process.ts";
import { harnessDefinitions } from "../registry.ts";

export async function discoverModels(
  harness: HarnessKind,
  directory: string,
  signal: AbortSignal = AbortSignal.timeout(30_000),
): Promise<HarnessModelCatalog> {
  try {
    const executable = await resolveExecutable(harness);
    const models = await harnessDefinitions[harness].discoverModels(
      executable,
      directory,
      AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
    );
    return harnessModelCatalogSchema.parse({ harness, status: "ready", models });
  } catch {
    // Do not send native stderr, authentication payloads, or local paths to the renderer.
    return { harness, status: "unavailable", models: [] };
  }
}
