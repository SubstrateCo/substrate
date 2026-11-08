import { z } from "zod";

/** Events that start or continue an agent run. Add new kinds here and in the trigger evaluator. */
export const agentTriggerKinds = ["direct_message", "mention", "thread_reply"] as const;
export type AgentTriggerKind = (typeof agentTriggerKinds)[number];

/** Values a prompt template can use as `{{name}}`. */
export const agentPromptVariables = [
  "agentName",
  "authorName",
  "conversationName",
  "conversationKind",
  "conversationId",
  "threadId",
  "messageId",
  "messages",
] as const;
export type AgentPromptVariable = (typeof agentPromptVariables)[number];
export type AgentPromptValues = Record<AgentPromptVariable, string>;

const replyInstruction =
  "Reply with the send_message tool, using conversationId {{conversationId}} and threadId {{threadId}}. " +
  "Use read_thread with messageId {{threadId}} if you need earlier messages. " +
  "If you need a decision from {{authorName}} before you continue, ask in that thread and stop.";

export const agentTriggers: Record<
  AgentTriggerKind,
  { title: string; description: string; defaultPrompt: string }
> = {
  direct_message: {
    title: "Direct message",
    description: "You send a message in your direct conversation with this agent.",
    defaultPrompt: `{{authorName}} sent you a direct message in Startup OS.

{{messages}}

Do what they ask. ${replyInstruction}`,
  },
  mention: {
    title: "Mention",
    description: "You mention this agent in a channel, group, or thread it is a member of.",
    defaultPrompt: `{{authorName}} mentioned you in {{conversationName}} ({{conversationKind}}) in Startup OS.

{{messages}}

Do what they ask. ${replyInstruction}`,
  },
  thread_reply: {
    title: "Thread reply",
    description: "You reply in a thread where this agent already worked.",
    defaultPrompt: `{{authorName}} replied in a thread you worked in, in {{conversationName}} ({{conversationKind}}).

{{messages}}

Continue the work. ${replyInstruction}`,
  },
};

export const agentPromptTemplate = z.string().trim().min(1).max(20_000);

/** Replaces known `{{variable}}` placeholders. Unknown placeholders stay as written. */
export function renderAgentPrompt(template: string, values: AgentPromptValues) {
  const known = new Map<string, string>(Object.entries(values));
  return template.replace(
    /\{\{\s*([a-zA-Z]+)\s*\}\}/g,
    (match, name: string) => known.get(name) ?? match,
  );
}

export interface AgentTriggerSetting {
  kind: AgentTriggerKind;
  enabled: boolean;
  /** Null uses the default prompt. */
  prompt: string | null;
}

export const saveAgentTriggersInput = z.strictObject({
  agentId: z.uuid(),
  triggers: z
    .array(
      z.strictObject({
        kind: z.enum(agentTriggerKinds),
        enabled: z.boolean(),
        prompt: agentPromptTemplate.nullable(),
      }),
    )
    .max(agentTriggerKinds.length),
});
export type SaveAgentTriggersInput = z.input<typeof saveAgentTriggersInput>;
