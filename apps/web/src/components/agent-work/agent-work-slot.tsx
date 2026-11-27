import { useContext, type ReactNode } from "react";

import { AgentWorkContext, type AgentWorkRenderer } from "./agent-work-context";

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
  const render = useContext(AgentWorkContext);
  return render?.work({ id: messageId, fromAgent });
}

export function AgentWorkStatus({ messageId }: { messageId: string }) {
  const render = useContext(AgentWorkContext);
  return render?.status(messageId);
}

export function AgentWorkBadge({ messageId }: { messageId: string }) {
  const render = useContext(AgentWorkContext);
  return render?.badge(messageId);
}

export function AgentWorkNotice({ threadId }: { threadId: string | null }) {
  const render = useContext(AgentWorkContext);
  return render?.notice(threadId);
}
