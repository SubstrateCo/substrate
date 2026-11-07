import { z } from "zod";

export const agentAccessScope = z.strictObject({
  organizationId: z.string().min(1),
  agentId: z.uuid(),
});
export const agentAccessChange = agentAccessScope.extend({
  projectEntityId: z.uuid(),
  level: z.enum(["view", "comment", "edit"]).nullable(),
});
export type AgentAccessChange = z.infer<typeof agentAccessChange>;
