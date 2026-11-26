import {
  harnessModelCatalogSchema,
  type HarnessAuthMethod,
  type HarnessKind,
  type HarnessModel,
  type HarnessModelCatalog,
} from "@substrate/contracts/harness-runtime";

import {
  acpAuthRequired,
  type AcpConfigOption,
  type AcpPeer,
  type OpenAcpPeer,
} from "../acp/api.ts";
import { requireAgent } from "../acp/detect.ts";
import { openAcpPeer } from "../acp/index.ts";
import { HarnessError } from "../errors.ts";

/** Models from the agent's "model" select option. The current value is the default. */
function acpModels(options: AcpConfigOption[]): HarnessModel[] {
  const option = options.find((entry) => entry.category === "model" && entry.type === "select");
  if (!option) return [];
  return option.values.map((value) => {
    const model: HarnessModel = { id: value.value, name: value.name || value.value };
    if (value.description) model.description = value.description;
    if (value.value === option.currentValue) model.isDefault = true;
    return model;
  });
}

/** What the renderer may know about the agent's sign-in: names and types, no launch details. */
function acpAuth(peer: Pick<AcpPeer, "authMethods" | "capabilities">) {
  return {
    methods: peer.authMethods.slice(0, 20).map((method) => {
      const entry: HarnessAuthMethod = { id: method.id, name: method.name, type: method.type };
      if (method.description) entry.description = method.description;
      return entry;
    }),
    signOut: peer.capabilities.logout,
  };
}

/** The agent's catalog; sign-in when session setup answers auth_required. */
export async function discoverAcpModels(
  harness: HarnessKind,
  directory: string,
  signal: AbortSignal,
  /** Test seam. */
  agents: { openPeer: OpenAcpPeer; requireAgent: typeof requireAgent } = {
    openPeer: openAcpPeer,
    requireAgent,
  },
): Promise<Omit<HarnessModelCatalog, "harness">> {
  const peer = await agents.openPeer(await agents.requireAgent(harness), {
    cwd: directory,
    signal,
  });
  try {
    const auth = acpAuth(peer);
    try {
      return {
        status: "ready",
        models: acpModels(await peer.probeConfigOptions(directory, signal)),
        auth,
      };
    } catch (error) {
      if (error instanceof HarnessError && error.code === acpAuthRequired)
        return { status: "sign-in", models: [], auth };
      throw error;
    }
  } finally {
    await peer.close();
  }
}

export async function discoverModels(
  harness: HarnessKind,
  directory: string,
  signal: AbortSignal = AbortSignal.timeout(30_000),
): Promise<HarnessModelCatalog> {
  try {
    const catalog = await discoverAcpModels(
      harness,
      directory,
      AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
    );
    return harnessModelCatalogSchema.parse({ harness, ...catalog });
  } catch {
    // Do not send native stderr, authentication payloads, or local paths to the renderer.
    return { harness, status: "unavailable", models: [] };
  }
}
