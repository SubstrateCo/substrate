import { useQuery } from "@tanstack/react-query";

import type { ReactNode } from "react";

import { AgentRunCard } from "./agent-run-card";
import { AgentRunProvider } from "./agent-run-slot";
import { latestRunByMessage } from "@/lib/agent-runs/runs";
import { conversationAgentRunsOptions } from "@/queries/agent-runs/options";

// One query per conversation feeds the cards in both the channel and the thread pane.
// The server returns only the viewer's own runs. Realtime hints keep it fresh.
export function ConversationAgentRuns({
  userId,
  organizationId,
  conversationId,
  enabled,
  children,
}: {
  userId?: string;
  organizationId: string;
  conversationId: string;
  enabled: boolean;
  children: ReactNode;
}) {
  const runs = useQuery({
    ...conversationAgentRunsOptions(userId ?? "", organizationId, conversationId),
    enabled: enabled && !!userId,
  });
  const byMessage = latestRunByMessage(runs.data ?? []);
  return (
    <AgentRunProvider
      render={(messageId) => {
        const run = byMessage.get(messageId);
        return run && userId ? (
          <AgentRunCard userId={userId} organizationId={organizationId} run={run} />
        ) : null;
      }}
    >
      {children}
    </AgentRunProvider>
  );
}
