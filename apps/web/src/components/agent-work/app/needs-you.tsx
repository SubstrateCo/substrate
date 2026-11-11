import type { AgentRequestPlace } from "@substrate/contracts/agent-work";

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { RequestCard } from "../requests/request-card";
import { NeedsYouView, type NeedsYouEntry } from "./needs-you-view";
import { hiddenConversation } from "@/lib/agent-work/hidden-records";
import { needsYouItems } from "@/lib/agent-work/needs-you";
import { agentStatus } from "@/lib/agent-work/status";
import { messageLink } from "@/lib/navigation/record-links";
import { needsYouOptions } from "@/queries/agent-work/server";

function Place({ organizationId, place }: { organizationId: string; place: AgentRequestPlace }) {
  if (place.access === "hidden") return <span>{hiddenConversation}</span>;
  if (place.access === "none") return <span>Not from a message</span>;
  return (
    <Link
      {...messageLink(organizationId, place.conversationId, place.anchorMessageId ?? undefined)}
      className="min-w-0 truncate font-medium text-primary hover:underline"
    >
      In {place.conversationName}
    </Link>
  );
}

export function NeedsYou({
  userId,
  organizationId,
  onOpenAgent,
}: {
  userId: string;
  organizationId: string;
  onOpenAgent: (agentId: string) => void;
}) {
  const needsYou = useQuery(needsYouOptions(userId, organizationId));
  const { requests, agents } = needsYouItems(needsYou.data);
  const entries: NeedsYouEntry[] = [
    ...requests.map((request) => ({
      key: request.id,
      agentName: request.agent.name,
      place: <Place organizationId={organizationId} place={request.place} />,
      body: <RequestCard userId={userId} organizationId={organizationId} request={request} />,
      onOpenAgent: () => onOpenAgent(request.userAgentId),
    })),
    // Agents that need a decision with no request, such as work that stopped.
    ...agents.map((status) => ({
      key: `agent:${status.userAgentId}`,
      agentName: status.agent.name,
      place: <span>{agentStatus(status).label}</span>,
      body: (
        <p className="text-sm text-muted-foreground">
          Work stopped. Open the agent’s activity to retry, start fresh, or dismiss it
          {status.device ? ` on ${status.device.name}` : ""}.
        </p>
      ),
      onOpenAgent: () => onOpenAgent(status.userAgentId),
    })),
  ];
  return (
    <NeedsYouView
      entries={entries}
      loading={needsYou.isPending}
      error={needsYou.error}
      onRetry={() => void needsYou.refetch()}
    />
  );
}
