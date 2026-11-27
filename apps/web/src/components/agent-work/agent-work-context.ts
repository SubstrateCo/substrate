import { createContext, useContext, type ReactNode } from "react";

export type AgentWorkRenderer = {
  /** Work, waiting messages, and request cards under the message they belong to. */
  work: (message: { id: string; fromAgent: boolean }) => ReactNode;
  /** The status of the work behind an agent's reply, in the reply's header. */
  status: (messageId: string) => ReactNode;
  /** The work's status dot, on the avatar of the agent's reply. */
  badge: (messageId: string) => ReactNode;
  /** Replaces the avatar of the agent's reply while its work runs. Null keeps the avatar. */
  avatar: (messageId: string) => ReactNode;
  /** The owner message shows a pending agent reply row under it. */
  pendingReply: (messageId: string) => boolean;
  /** A line above the composer about the owner's agents here. Null threadId is the main pane. */
  notice: (threadId: string | null) => ReactNode;
};

// Messaging renders slots; the agent-work container decides what goes in them. Without a
// provider, as for people who own no agent here, the slots render nothing.
export const AgentWorkContext = createContext<AgentWorkRenderer | null>(null);

/** The avatar to show in place of the agent reply's own, or null. */
export function useAgentWorkAvatar(messageId: string): ReactNode {
  const render = useContext(AgentWorkContext);
  return render?.avatar(messageId) ?? null;
}

/**
 * Whether an owner message shows a pending agent reply row under it. The next message then
 * starts a new group, so it never reads as the agent's.
 */
export function usePendingAgentReply(): (messageId: string) => boolean {
  const render = useContext(AgentWorkContext);
  return (messageId) => render?.pendingReply(messageId) ?? false;
}
