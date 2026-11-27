import type {
  AgentRequestPlace,
  AgentUncertainItemView,
  AgentWorkPlace,
} from "@substrate/contracts/agent-work";
import { needsYouItems } from "@substrate/contracts/agent-work/needs-you";

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { InboxReceiptView } from "../inbox-receipt-view";
import { NeedsAttention } from "../needs-attention";
import { RequestCard } from "../requests/request-card";
import { NeedsYouView, type NeedsYouEntry } from "./needs-you-view";
import { actionErrorMessage } from "@/components/feedback/action-error-message";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import { hiddenConversation } from "@/lib/agent-work/hidden-records";
import { agentStatus, attentionReasonText } from "@/lib/agent-work/status";
import { conversationName } from "@/lib/messaging/conversations";
import { agentLink, messageLink } from "@/lib/navigation/record-links";
import { useDiscardItem, useResendItem } from "@/queries/agent-work/mutations";
import { needsYouOptions } from "@/queries/agent-work/server";
import { conversationsQueryOptions } from "@/queries/messaging/options";
import { toast } from "sonner";

const placeLinkClass = "min-w-0 truncate font-medium text-primary hover:underline";

function Place({ place }: { place: AgentRequestPlace }) {
  const { organizationId } = useWorkspaceScope();
  if (place.access === "hidden") return <span>{hiddenConversation}</span>;
  if (place.access === "none") return <span>Not from a message</span>;
  return (
    <Link
      {...messageLink(organizationId, place.conversationId, place.anchorMessageId ?? undefined)}
      className={placeLinkClass}
    >
      In {place.conversationName}
    </Link>
  );
}

/**
 * The place of stopped work. The server sends no names, so the viewer's own conversation list
 * names it; a place the server or that list hides stays a placeholder.
 */
function WorkPlace({ place }: { place: AgentWorkPlace }) {
  const { organizationId } = useWorkspaceScope();
  const conversations = useQuery(conversationsQueryOptions(organizationId));
  const conversation =
    place && conversations.data?.find((entry) => entry.id === place.conversationId);
  if (!place || !conversation) return <span>{hiddenConversation}</span>;
  return (
    <Link {...messageLink(organizationId, place.conversationId)} className={placeLinkClass}>
      In {conversationName(conversation)}
    </Link>
  );
}

/** A message the home desktop couldn't confirm the agent received, outside a listed turn. */
function UncertainItem({ item }: { item: AgentUncertainItemView }) {
  const { userId, organizationId } = useWorkspaceScope();
  const resend = useResendItem(userId, organizationId);
  const discard = useDiscardItem(userId, organizationId);
  return (
    <InboxReceiptView
      label={attentionReasonText("uncertain_input", item.agent.name)}
      tone="attention"
      sending={false}
      resolving={resend.isPending || discard.isPending}
      onResend={() =>
        resend.mutate(item.id, {
          onError: (error) =>
            toast.error(actionErrorMessage(error, "We couldn't resend the message.")),
        })
      }
      onDiscard={() =>
        discard.mutate(item.id, {
          onError: (error) =>
            toast.error(actionErrorMessage(error, "We couldn't discard the message.")),
        })
      }
    />
  );
}

/** Everything that waits for the owner, from the server, so it works on every device. */
export function NeedsYou() {
  const { userId, organizationId } = useWorkspaceScope();
  const needsYou = useQuery(needsYouOptions(userId, organizationId));
  const { requests, turns, items, agents } = needsYouItems(needsYou.data);
  const entries: NeedsYouEntry[] = [
    ...requests.map((request) => ({
      key: request.id,
      agentName: request.agent.name,
      place: <Place place={request.place} />,
      body: <RequestCard request={request} />,
      agentLink: agentLink(organizationId, request.userAgentId),
    })),
    ...turns.map((turn) => ({
      key: `turn:${turn.id}`,
      agentName: turn.agent.name,
      place: <WorkPlace place={turn.place} />,
      body: (
        <NeedsAttention
          turn={turn}
          agentName={turn.agent.name}
          uncertainItemIds={turn.uncertainItemIds}
        />
      ),
      agentLink: agentLink(organizationId, turn.userAgentId, { view: "work", turnId: turn.id }),
    })),
    ...items.map((item) => ({
      key: `item:${item.id}`,
      agentName: item.agent.name,
      place: <WorkPlace place={item.place} />,
      body: <UncertainItem item={item} />,
      agentLink: agentLink(organizationId, item.userAgentId, { view: "work" }),
    })),
    // Agents that need the owner with nothing listed above.
    ...agents.map((status) => ({
      key: `agent:${status.userAgentId}`,
      agentName: status.agent.name,
      place: <span>{agentStatus(status).label}</span>,
      body: (
        <p className="text-sm text-muted-foreground">
          Work stopped. Open the agent’s work to retry, start fresh, or dismiss it.
        </p>
      ),
      agentLink: agentLink(organizationId, status.userAgentId, { view: "work" }),
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
