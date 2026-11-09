import { createContext, useContext, type ReactNode } from "react";

export type AgentWorkRenderer = {
  /** Work, waiting messages, and request cards under the message they belong to. */
  work: (message: { id: string; fromAgent: boolean }) => ReactNode;
  /** The work's status dot, on the avatar of the agent's reply. */
  badge: (messageId: string) => ReactNode;
  /** A line above the composer about the owner's agents here. Null threadId is the main pane. */
  notice: (threadId: string | null) => ReactNode;
};

const AgentWorkContext = createContext<AgentWorkRenderer | null>(null);

// Messaging renders slots; the agent-work container decides what goes in them. Without a
// provider, as for people who own no agent here, the slots render nothing.
export function AgentWorkProvider({
  children,
  render,
}: {
  children: ReactNode;
  render: AgentWorkRenderer;
}) {
  return <AgentWorkContext.Provider value={render}>{children}</AgentWorkContext.Provider>;
}

export function AgentWorkSlot({ messageId, fromAgent }: { messageId: string; fromAgent: boolean }) {
  return useContext(AgentWorkContext)?.work({ id: messageId, fromAgent }) ?? null;
}

export function AgentWorkBadge({ messageId }: { messageId: string }) {
  return useContext(AgentWorkContext)?.badge(messageId) ?? null;
}

export function AgentWorkNotice({ threadId }: { threadId: string | null }) {
  return useContext(AgentWorkContext)?.notice(threadId) ?? null;
}
