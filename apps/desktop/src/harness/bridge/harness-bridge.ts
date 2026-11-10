import {
  harnessIdSchema,
  harnessKinds,
  harnessMcpServerSchema,
  harnessSkillSchema,
  turnContextSchema,
  turnKinds,
} from "@startup-os/contracts/harness";

/* oxlint-disable deslop/no-unknown-parameters -- These functions parse untrusted IPC payloads at the main-process boundary. */
import { z } from "zod";

export const harnessChannel = "startup-os:harness";
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
/** Renderer methods. Session commands are main-only; see HarnessController.execute. */
export const harnessMethods = ["status", "synchronize", ...localHarnessMethods] as const;
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
const session = { organizationId: id, sessionId: z.string().min(1).max(200) };
const inputId = z.string().min(1).max(200);
const text = z.string().min(1).max(1_000_000);
const commandSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("open"),
    ...session,
    agentId: id,
    folder: z.union([z.literal("main"), z.strictObject({ helperId: id })]),
    nativeSessionId: z.string().min(1).max(500).optional(),
    epoch: z.number().int().min(0),
    requireResume: z.boolean().optional(),
    prefix: z.string().max(100_000),
  }),
  z.strictObject({
    type: z.literal("turn"),
    ...session,
    turnId: z.uuid(),
    generation: z.number().int().min(0),
    mode: z.enum(turnKinds),
    input: z.strictObject({ inputIds: z.array(inputId).min(1).max(64), text }),
    context: turnContextSchema,
  }),
  z.strictObject({ type: z.literal("steer"), ...session, turnId: z.uuid(), inputId, text }),
  z.strictObject({ type: z.literal("interrupt"), ...session, turnId: z.uuid() }),
  z.strictObject({
    type: z.literal("respond"),
    ...session,
    requestId: z.string().min(1).max(500),
    response: z.json().refine((value) => JSON.stringify(value).length <= 100000),
  }),
  z.strictObject({ type: z.literal("compact"), ...session }),
  z.strictObject({ type: z.literal("close"), ...session }),
]);
export function parseHarnessCommand(value: unknown) {
  return commandSchema.parse(value);
}
