import { harnessAgentSchema } from "./agent.ts";
import { z } from "zod";

export const desktopAgentCatalogSchema = z.object({
  agents: z.array(harnessAgentSchema),
  runSettings: z.array(
    z.object({ agentId: z.string(), homeDevice: z.object({ current: z.boolean() }).nullable() }),
  ),
});
