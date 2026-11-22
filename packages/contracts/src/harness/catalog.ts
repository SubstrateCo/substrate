import { agentTriggerKinds } from "../agents/triggers.ts";
import { harnessAgentSchema } from "./agent.ts";
import { z } from "zod";

export const desktopAgentCatalogSchema = z.object({
  agents: z.array(harnessAgentSchema),
  runSettings: z.array(
    z.object({
      agentId: z.string(),
      homeDevice: z.object({ current: z.boolean() }).nullable(),
      triggers: z.array(z.object({ kind: z.enum(agentTriggerKinds), enabled: z.boolean() })),
    }),
  ),
});
