import {
  harnessIdSchema,
  harnessKinds,
  harnessMcpServerSchema,
  harnessSkillSchema,
} from "@startup-os/contracts/harness";

/* oxlint-disable deslop/no-unknown-parameters -- These functions parse untrusted IPC payloads at the main-process boundary. */
import { z } from "zod";

export const harnessChannel = "startup-os:harness";
export const harnessEventChannel = "startup-os:harness-event";
export const localHarnessMethods = [
  "listModels",
  "scanConfiguration",
  "saveSkill",
  "deleteSkill",
  "resetDefaults",
  "saveMcpServer",
  "deleteMcpServer",
] as const;
export type LocalHarnessMethod = (typeof localHarnessMethods)[number];
export const harnessMethods = ["status", "synchronize", "execute", ...localHarnessMethods] as const;
export type HarnessMethod = (typeof harnessMethods)[number];
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
const commandSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("start"), organizationId: id, agentId: id }),
  z.strictObject({ type: z.literal("resume"), organizationId: id, sessionId: id }),
  z.strictObject({
    type: z.literal("prompt"),
    organizationId: id,
    sessionId: id,
    text: z.string().min(1).max(100000),
  }),
  z.strictObject({ type: z.literal("interrupt"), organizationId: id, sessionId: id }),
  z.strictObject({
    type: z.literal("respond"),
    organizationId: id,
    sessionId: id,
    requestId: id,
    response: z.json().refine((value) => JSON.stringify(value).length <= 100000),
  }),
  z.strictObject({ type: z.literal("disconnect"), organizationId: id, sessionId: id }),
]);
export function parseHarnessCommand(value: unknown) {
  return commandSchema.parse(value);
}
