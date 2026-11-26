import { harnessKinds } from "./kinds.ts";
import { harnessSkillSchema } from "./local.ts";
import { z } from "zod";

/**
 * A skill the host owns in the agent folder. Installed skills are rewritten on every write;
 * others are removed while the folder still holds the host's copy. User skills are never touched.
 */
export const managedSkillSchema = harnessSkillSchema.extend({ installed: z.boolean() });

/** One agent as the runtime runs it. The host computes its instructions, skills and tools. */
export const harnessAgentSchema = z.object({
  id: z.string(),
  harness: z.enum(harnessKinds),
  model: z.string().optional(),
  enabled: z.boolean(),
  /** The content of the harness's instructions file, before the managed prefix. */
  instructions: z.string(),
  managedSkills: z.array(managedSkillSchema),
  /**
   * Host tools offered to the agent's main folder and to its helpers' folders, by name. Null:
   * the agent's sessions get no host MCP server.
   */
  tools: z.object({ main: z.array(z.string()), helper: z.array(z.string()) }).nullable(),
});

export const harnessConfigurationSchema = z.object({
  organizationId: z.string(),
  agents: z.array(harnessAgentSchema),
});

export type ManagedSkill = z.infer<typeof managedSkillSchema>;
export type HarnessAgent = z.infer<typeof harnessAgentSchema>;
export type HarnessConfiguration = z.infer<typeof harnessConfigurationSchema>;
