import { createContext, useContext, type ReactNode } from "react";

type AgentRunRenderer = (messageId: string) => ReactNode;

const AgentRunContext = createContext<AgentRunRenderer | null>(null);

// A connected container supplies run cards. Message views mark where each card goes.
export function AgentRunProvider({
  render,
  children,
}: {
  render: AgentRunRenderer;
  children: ReactNode;
}) {
  return <AgentRunContext.Provider value={render}>{children}</AgentRunContext.Provider>;
}

export function AgentRunSlot({ messageId }: { messageId: string }) {
  return useContext(AgentRunContext)?.(messageId) ?? null;
}
