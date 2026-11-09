import { z } from "zod";

/** Owner messages that wake an agent. Add new kinds here and in the wake router. */
export const agentTriggerKinds = ["direct_message", "mention", "thread_reply"] as const;
export type AgentTriggerKind = (typeof agentTriggerKinds)[number];

export const agentTriggers: Record<AgentTriggerKind, { title: string; description: string }> = {
  direct_message: {
    title: "Direct message",
    description: "You send a message in your direct conversation with this agent.",
  },
  mention: {
    title: "Mention",
    description: "You mention this agent in a channel, group, or thread it is a member of.",
  },
  thread_reply: {
    title: "Thread reply",
    description: "You reply in a thread where this agent already worked.",
  },
};

export interface AgentTriggerSetting {
  kind: AgentTriggerKind;
  enabled: boolean;
}

export const saveAgentTriggersInput = z.strictObject({
  agentId: z.uuid(),
  triggers: z
    .array(z.strictObject({ kind: z.enum(agentTriggerKinds), enabled: z.boolean() }))
    .max(agentTriggerKinds.length),
});
export type SaveAgentTriggersInput = z.input<typeof saveAgentTriggersInput>;
