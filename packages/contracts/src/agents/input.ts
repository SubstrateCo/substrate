import { harnessKinds } from "../harness-runtime/kinds.ts";
import { agentAvatarCode } from "./avatar.ts";
import { agentTriggerKinds } from "./triggers.ts";
import { z } from "zod";

const id = z.uuid();
const name = z.string().trim().min(1).max(200);
export const saveAgentInput = z.strictObject({
  id: id.optional(),
  name,
  instructions: z.string().max(100000),
  harness: z.enum(harnessKinds),
  model: z.string().trim().min(1).max(500).optional(),
  enabled: z.boolean(),
  useStartupDefaults: z.boolean().default(true),
});
export const deleteAgentInput = z.strictObject({ id });
export const saveSkillInput = z.strictObject({
  id: id.optional(),
  name: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase words separated by hyphens."),
  description: z.string().max(2000),
  content: z.string().max(100000),
});
export type SaveAgentInput = z.input<typeof saveAgentInput>;
/** Validated agent fields, as the route passes them to the repository. */
export type SaveAgentValues = z.output<typeof saveAgentInput>;
export type SaveSkillInput = z.input<typeof saveSkillInput>;
/** A saved agent, as the catalog returns it. Its fields passed saveAgentInput when saved. */
const agentConfiguration = z.object({
  id: z.string(),
  name: z.string(),
  instructions: z.string(),
  harness: z.enum(harnessKinds),
  model: z.string().optional(),
  enabled: z.boolean(),
  useStartupDefaults: z.boolean(),
  avatar: agentAvatarCode,
});
export type AgentConfiguration = z.infer<typeof agentConfiguration>;
/** Where and when an agent runs. Kept apart from the editable configuration. */
const agentRunSettings = z.object({
  agentId: z.string(),
  homeDevice: z
    .object({ id: z.string(), name: z.string(), online: z.boolean(), current: z.boolean() })
    .nullable(),
  triggers: z.array(z.object({ kind: z.enum(agentTriggerKinds), enabled: z.boolean() })),
});
export type AgentRunSettings = z.infer<typeof agentRunSettings>;
export const agentCatalogSchema = z.object({
  agents: z.array(agentConfiguration),
  runSettings: z.array(agentRunSettings),
});
export type AgentCatalog = z.infer<typeof agentCatalogSchema>;
