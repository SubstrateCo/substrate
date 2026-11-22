import { appIds } from "../apps/index.ts";
import { harnessKinds } from "./kinds.ts";
import { z } from "zod";

export const harnessAgentSchema = z.object({
  id: z.string(),
  name: z.string(),
  instructions: z.string(),
  harness: z.enum(harnessKinds),
  model: z.string().optional(),
  enabled: z.boolean(),
  useStartupDefaults: z.boolean(),
});

export const harnessConfigurationSchema = z.object({
  organizationId: z.string(),
  agents: z.array(harnessAgentSchema),
  enabledApps: z.array(z.enum(appIds)).optional(),
});

export type HarnessAgent = z.infer<typeof harnessAgentSchema>;
export type HarnessConfiguration = z.infer<typeof harnessConfigurationSchema>;
