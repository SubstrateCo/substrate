import { z } from "zod";

/** Owner messages that wake an agent, and the wake kinds. */
export const agentTriggerKinds = ["direct_message", "mention", "thread_reply"] as const;
export type AgentTriggerKind = (typeof agentTriggerKinds)[number];

/** Accepts the kinds only when every trigger kind is in them. */
function everyKind<const T extends readonly AgentTriggerKind[]>(
  kinds: T & ([Exclude<AgentTriggerKind, T[number]>] extends [never] ? unknown : never),
) {
  return kinds;
}

/** One wake per owner message: the first kind here that matches wins. */
export const agentTriggerPrecedence = everyKind(["mention", "direct_message", "thread_reply"]);

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
    title: "Thread updates",
    description:
      "Add new thread messages to this agent's current work. Updates never start a new turn.",
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
