import type { AgentRequestPlace } from "@substrate/contracts/agent-work";

import { useQuery } from "@tanstack/react-query";
import { Link, linkOptions } from "@tanstack/react-router";

import { CallCard } from "../calls/call-card";
import { RequestCard } from "../requests/request-card";
import { NeedsYouView, type NeedsYouEntry } from "./needs-you-view";
import { Timestamp } from "@/components/time/timestamp";
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

export function NeedsYou({ userId, organizationId }: { userId: string; organizationId: string }) {
  const needsYou = useQuery(needsYouOptions(userId, organizationId));
  const { requests, agents, calls, desktopUpdateRequired } = needsYouItems(needsYou.data);
  const agentLink = (agentId: string, section?: "activity") =>
    linkOptions({ to: "/agents", search: { workspaceId: organizationId, agentId, section } });
  const entries: NeedsYouEntry[] = [
    ...desktopUpdateRequired.map((update) => ({
      key: `desktop-update:${update.userAgentId}`,
      agentName: update.agent.name,
      place: <span>Desktop needs update</span>,
      body: (
        <div className="grid gap-2 text-sm">
          <p>Update the Substrate desktop app so {update.agent.name} can answer calls.</p>
          <p className="text-xs text-muted-foreground">
            {update.droppedCalls} {update.droppedCalls === 1 ? "call dropped" : "calls dropped"}
            {" · Last dropped "}
            <Timestamp value={update.lastDroppedAt} format="relative" />
          </p>
        </div>
      ),
      agentLink: agentLink(update.userAgentId),
    })),
    ...calls.map((call) => ({
      key: `call:${call.id}`,
      agentName: call.agent.name,
      place: <Place organizationId={organizationId} place={call.place} />,
      body: <CallCard userId={userId} organizationId={organizationId} call={call} />,
      agentLink: agentLink(call.userAgentId),
    })),
    ...requests.map((request) => ({
      key: request.id,
      agentName: request.agent.name,
      place: <Place organizationId={organizationId} place={request.place} />,
      body: <RequestCard userId={userId} organizationId={organizationId} request={request} />,
      agentLink: agentLink(request.userAgentId),
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
      agentLink: agentLink(status.userAgentId, "activity"),
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
