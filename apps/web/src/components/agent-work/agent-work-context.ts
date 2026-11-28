import { createContext, useContext, type ReactNode } from "react";

import type { WorkMood } from "@/lib/agent-work/status";

export type AgentWorkRenderer = {
  work: (message: { id: string; fromAgent: boolean }) => ReactNode;
  status: (messageId: string) => ReactNode;
  badge: (messageId: string) => ReactNode;
  mood: (messageId: string) => WorkMood | null;
  pendingReply: (messageId: string) => boolean;
  notice: (threadId: string | null) => ReactNode;
};

export const AgentWorkContext = createContext<AgentWorkRenderer | null>(null);

export function useAgentWorkMood(messageId: string): WorkMood | null {
  const render = useContext(AgentWorkContext);
  return render?.mood(messageId) ?? null;
}

export function usePendingAgentReply(): (messageId: string) => boolean {
  const render = useContext(AgentWorkContext);
  return (messageId) => render?.pendingReply(messageId) ?? false;
}
