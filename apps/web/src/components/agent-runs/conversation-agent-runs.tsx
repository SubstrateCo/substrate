import { useQuery } from "@tanstack/react-query";

import type { ReactNode } from "react";

import { AgentRunCard } from "./agent-run-card";
import { AgentRunIndicator } from "./agent-run-indicator";
import { AgentRunProvider } from "./agent-run-slot";
import { runPlacements, runStatus } from "@/lib/agent-runs/runs";
import { conversationAgentRunsOptions } from "@/queries/agent-runs/options";

// One query per conversation feeds the runs in both the channel and the thread pane.
// The server returns only the viewer's own runs. Realtime hints keep it fresh.
export function ConversationAgentRuns({
  userId,
  organizationId,
  conversationId,
  enabled,
  onTranscript,
  children,
}: {
  userId?: string;
  organizationId: string;
  conversationId: string;
  enabled: boolean;
  onTranscript: (runId: string) => void;
  children: ReactNode;
}) {
  const runs = useQuery({
    ...conversationAgentRunsOptions(userId ?? "", organizationId, conversationId),
    enabled: enabled && !!userId,
  });
  const placements = runPlacements(runs.data ?? []);
  return (
    <AgentRunProvider
      render={{
        work: (messageId) => {
          const placement = placements.get(messageId);
          return placement && userId ? (
            <AgentRunCard
              key={placement.run.id}
              userId={userId}
              organizationId={organizationId}
              placement={placement}
              onTranscript={onTranscript}
            />
          ) : null;
        },
        badge: (messageId) => {
          const placement = placements.get(messageId);
          if (placement?.kind !== "reply") return null;
          // The tone does not depend on the clock; the work line under the reply shows the time.
          return <AgentRunIndicator tone={runStatus(placement.run, 0).tone} />;
        },
      }}
    >
      {children}
    </AgentRunProvider>
  );
}
