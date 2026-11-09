import { createContext, useContext, type ReactNode } from "react";

type AgentRunRenderer = {
  /** The run's work, under the message it belongs to. */
  work: (messageId: string) => ReactNode;
  /** The run's status dot, on the avatar of the agent's reply. */
  badge: (messageId: string) => ReactNode;
};

const AgentRunContext = createContext<AgentRunRenderer | null>(null);

// Messaging renders slots; the agent-runs container decides what goes in them.
export function AgentRunProvider({
  children,
  render,
}: {
  children: ReactNode;
  render: AgentRunRenderer;
}) {
  return <AgentRunContext.Provider value={render}>{children}</AgentRunContext.Provider>;
}

export function AgentRunSlot({ messageId }: { messageId: string }) {
  return useContext(AgentRunContext)?.work(messageId) ?? null;
}

export function AgentRunBadge({ messageId }: { messageId: string }) {
  return useContext(AgentRunContext)?.badge(messageId) ?? null;
}
