import { bridgeOutput, type BridgeAPI } from "../desktop/ipc.ts";
import { harnessKinds } from "./kinds.ts";
import { harnessIdSchema } from "./local.ts";
import { harnessMcpServerSchema, harnessSkillSchema } from "./local.ts";
import type { HarnessInspection, HarnessLocalConfiguration } from "./local.ts";
import type { HarnessModelCatalog } from "./models.ts";
import { z } from "zod";

export const channel = "substrate:harness";
const id = harnessIdSchema;
const harness = z.enum(harnessKinds);
export const rendererLocalSchemas = {
  listModels: z.strictObject({ harness, agentId: id.optional() }),
  scanConfiguration: z.strictObject({ harness, agentId: id }),
  saveSkill: harnessSkillSchema.extend({ harness, agentId: id, id: id.optional() }),
  deleteSkill: z.strictObject({ harness, agentId: id, id }),
  resetDefaults: z.strictObject({ harness, agentId: id }),
  saveMcpServer: z.union(
    harnessMcpServerSchema.options.map((schema) =>
      schema.extend({ harness, agentId: id, id: id.optional() }),
    ),
  ),
  deleteMcpServer: z.strictObject({ harness, agentId: id, id }),
};
export const methods = {
  status: {
    input: z.undefined(),
    output: bridgeOutput<{
      connected: boolean;
      organizationId?: string;
      harnesses?: HarnessInspection[];
    }>(),
  },
  synchronize: {
    input: z.undefined(),
    output: z.object({ connected: z.literal(true), organizationId: z.string() }),
  },
  disconnect: { input: z.undefined() },
  listModels: {
    input: rendererLocalSchemas.listModels,
    output: bridgeOutput<HarnessModelCatalog>(),
  },
  scanConfiguration: {
    input: rendererLocalSchemas.scanConfiguration,
    output: bridgeOutput<HarnessLocalConfiguration>(),
  },
  saveSkill: { input: rendererLocalSchemas.saveSkill },
  deleteSkill: { input: rendererLocalSchemas.deleteSkill },
  resetDefaults: { input: rendererLocalSchemas.resetDefaults },
  saveMcpServer: { input: rendererLocalSchemas.saveMcpServer },
  deleteMcpServer: { input: rendererLocalSchemas.deleteMcpServer },
};
export type HarnessAPI = BridgeAPI<typeof methods>;
export type LocalHarnessMethod = keyof typeof rendererLocalSchemas;
// SAFETY: schema keys are the nonempty allowlist of renderer-local operations.
export const localHarnessMethods = Object.keys(rendererLocalSchemas) as [
  LocalHarnessMethod,
  ...LocalHarnessMethod[],
];
export const harnessMethods = ["status", "synchronize", ...localHarnessMethods] as const;
export type HarnessMethod = (typeof harnessMethods)[number];
