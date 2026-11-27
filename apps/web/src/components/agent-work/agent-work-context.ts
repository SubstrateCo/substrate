import { createContext, useContext, type ReactNode } from "react";

import type { WorkMood } from "@/lib/agent-work/status";

export type AgentWorkRenderer = {
  /** Work, waiting messages, and request cards under the message they belong to. */
  work: (message: { id: string; fromAgent: boolean }) => ReactNode;
  /** The status of the work behind an agent's reply, in the reply's header. */
  status: (messageId: string) => ReactNode;
  /** The work's status dot, on the avatar of the agent's reply. */
  badge: (messageId: string) => ReactNode;
  /** The mood of the reply author's avatar while its work runs, or null. */
  mood: (messageId: string) => WorkMood | null;
  /** The owner message shows a pending agent reply row under it. */
  pendingReply: (messageId: string) => boolean;
  /** A line above the composer about the owner's agents here. Null threadId is the main pane. */
  notice: (threadId: string | null) => ReactNode;
};

// Messaging renders slots; the agent-work container decides what goes in them. Without a
// provider, as for people who own no agent here, the slots render nothing.
export const AgentWorkContext = createContext<AgentWorkRenderer | null>(null);

/** The mood of the agent reply's avatar while its work runs, or null. */
export function useAgentWorkMood(messageId: string): WorkMood | null {
  const render = useContext(AgentWorkContext);
  return render?.mood(messageId) ?? null;
}

/**
 * Whether an owner message shows a pending agent reply row under it. The next message then
 * starts a new group, so it never reads as the agent's.
 */
export function usePendingAgentReply(): (messageId: string) => boolean {
  const render = useContext(AgentWorkContext);
  return (messageId) => render?.pendingReply(messageId) ?? false;
}
