import { harnessKinds } from "../harness-runtime/kinds.ts";
import { agentAvatarCode } from "./avatar.ts";
import { agentTriggerKinds } from "./triggers.ts";
import { z } from "zod";

const id = z.uuid();
const name = z.string().trim().min(1).max(200);
/** Optional apps whose Substrate skill and tools an agent can go without. */
export const agentOptionalAppIds = ["tasks", "crm", "inbox"] as const;
export type AgentOptionalAppId = (typeof agentOptionalAppIds)[number];
const disabledApps = z
  .array(z.enum(agentOptionalAppIds))
  .max(agentOptionalAppIds.length)
  .refine((apps) => new Set(apps).size === apps.length, "Apps must be unique.");
export const saveAgentInput = z.strictObject({
  id: id.optional(),
  name,
  instructions: z.string().max(100000),
  harness: z.enum(harnessKinds),
  model: z.string().trim().min(1).max(500).optional(),
  enabled: z.boolean(),
  /** Apps whose Substrate skill and tools the agent does not get, even when they are enabled. */
  disabledApps: disabledApps.default([]),
  /** Adds Substrate's workspace guide before the agent's own instructions. */
  substrateGuide: z.boolean().default(true),
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
const agentConfiguration = z.object({
  id: z.string(),
  name: z.string(),
  instructions: z.string(),
  harness: z.enum(harnessKinds),
  model: z.string().optional(),
  enabled: z.boolean(),
  disabledApps: z.array(z.enum(agentOptionalAppIds)),
  substrateGuide: z.boolean(),
  avatar: agentAvatarCode,
});
export type AgentConfiguration = z.infer<typeof agentConfiguration>;
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
