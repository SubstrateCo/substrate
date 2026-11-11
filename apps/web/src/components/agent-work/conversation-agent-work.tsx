import type {
  AgentInboxItemView,
  AgentRequestView,
  AgentTurnView,
} from "@substrate/contracts/agent-work";
import { liveTurnStatuses } from "@substrate/contracts/agent-work";

import { useQuery } from "@tanstack/react-query";

import type { ReactNode } from "react";

import { AgentWorkProvider } from "./agent-work-slot";
import { ComposerNotice, type ComposerNoticeLine } from "./composer-notice";
import { InboxReceipt } from "./inbox-receipt";
import { ProposalBacklink } from "./requests/proposal-backlink";
import { RequestCard } from "./requests/request-card";
import { TurnLabel, TurnStatus, TurnWork } from "./turn-work";
import { WorkIndicator } from "./work-indicator";
import { actionErrorMessage } from "@/components/feedback/action-error-message";
import { conversationAgents } from "@/lib/agent-work/conversation-agents";
import { proposalSourceLink } from "@/lib/agent-work/links";
import { itemPlacements, requestPlacements, turnPlacements } from "@/lib/agent-work/placement";
import { isOpenRequest } from "@/lib/agent-work/requests";
import { agentStatus, noDesktopLabel, queueAhead, turnTone } from "@/lib/agent-work/status";
import type { Conversation } from "@/lib/messaging/conversations";
import { agentLink } from "@/lib/navigation/record-links";
import {
  conversationWorkOptions,
  localAgentsOptions,
  localWorkEnabled,
} from "@/queries/agent-work/local";
import { useNewTopic } from "@/queries/agent-work/mutations";
import { agentStatusOptions, conversationRequestsOptions } from "@/queries/agent-work/server";
import { toast } from "sonner";

/**
 * The owner's agent work in one conversation, for the channel and the thread pane. Other members
 * see no agent work: the server returns requests and status only to the agent's owner, and the
 * bridge holds only the work of agents homed on this desktop.
 *
 * Work loads whether or not the agent is still a member, so an agent that left still shows its
 * open requests and turns here. Local turns come from the bridge when an agent is homed on this
 * desktop. Other devices show the server's requests and the status the home desktop published.
 */
export function ConversationAgentWork({
  userId,
  organizationId,
  conversation,
  onTranscript,
  children,
}: {
  userId: string;
  organizationId: string;
  conversation: Conversation;
  onTranscript: (turnId: string) => void;
  children: ReactNode;
}) {
  // Members list agent IDs only for the viewer's own agents.
  const members = conversation.members.flatMap((member) =>
    member.type === "agent" && member.agentId
      ? [{ agentId: member.agentId, name: member.name }]
      : [],
  );
  const summaries = useQuery(localAgentsOptions(userId, organizationId));
  const homed = new Map((summaries.data ?? []).map((summary) => [summary.userAgentId, summary]));
  // Local work and its controls exist only when an agent of this owner is homed here.
  const local = useQuery({
    ...conversationWorkOptions(userId, organizationId, conversation.id),
    enabled: localWorkEnabled(userId) && homed.size > 0,
  });
  const requests = useQuery(conversationRequestsOptions(userId, organizationId, conversation.id));
  const statuses = useQuery(agentStatusOptions(userId, organizationId));
  const newTopic = useNewTopic(userId, organizationId);
  const turns = local.data?.turns ?? [];
  const sessions = new Map((local.data?.sessions ?? []).map((session) => [session.id, session]));
  const items = local.data?.items ?? [];

  const agents = conversationAgents({
    conversationId: conversation.id,
    members,
    turns,
    requests: requests.data ?? [],
    statuses: statuses.data ?? [],
  });
  const name = (agentId: string) =>
    agents.find((agent) => agent.agentId === agentId)?.name ?? "Agent";
  const uncertain = items.filter((entry) => entry.status === "uncertain");
  const uncertainItems = (turn: AgentTurnView) =>
    uncertain.filter((entry) => turn.itemIds.includes(entry.id)).map((entry) => entry.id);
  const { placements, anchors } = turnPlacements(turns, conversation.id);
  const waitingItems = itemPlacements(items, turns, conversation.id);
  const { cards, backlinks } = requestPlacements(requests.data ?? [], anchors, conversation.id);
  // The first open request of each turn.
  const openRequests = new Map<string, AgentRequestView>();
  for (const request of requests.data ?? [])
    if (isOpenRequest(request) && !openRequests.has(request.turnId))
      openRequests.set(request.turnId, request);
  const openRequest = (turnId: string) => openRequests.get(turnId);
  const outputs = new Set(
    turns.flatMap((turn) =>
      turn.outputs.flatMap((entry) => (entry.kind === "message" ? [entry.id] : [])),
    ),
  );
  const agentOf = (item: AgentInboxItemView) => sessions.get(item.sessionId)?.userAgentId ?? "";
  const itemsByAgent = new Map<string, AgentInboxItemView[]>();
  for (const item of items) {
    const agentId = agentOf(item);
    const list = itemsByAgent.get(agentId);
    if (list) list.push(item);
    else itemsByAgent.set(agentId, [item]);
  }

  const notice = (threadId: string | null) => {
    const lines: ComposerNoticeLine[] = [];
    for (const agent of agents) {
      const summary = homed.get(agent.agentId);
      if (summary) {
        const current = turns.find(
          (turn) =>
            turn.userAgentId === agent.agentId &&
            (liveTurnStatuses.includes(turn.status) || turn.status === "needs_attention") &&
            (sessions.get(turn.sessionId)?.origin?.threadId ?? null) === threadId,
        );
        if (current) {
          const request = openRequest(current.id);
          lines.push({
            key: agent.agentId,
            agentName: agent.name,
            tone: turnTone(current, request),
            label: <TurnLabel turn={current} openRequest={request} />,
          });
        }
        continue;
      }
      const status = statuses.data?.find((entry) => entry.userAgentId === agent.agentId);
      if (!status) continue;
      const here =
        status.liveConversationId === conversation.id && (status.liveThreadId ?? null) === threadId;
      // General lines describe the agent as a whole, so they show only where it is a member.
      if (!agent.member && !here) continue;
      if (!status.device) {
        if (threadId === null)
          lines.push({
            key: agent.agentId,
            agentName: agent.name,
            tone: "idle",
            label: noDesktopLabel,
            link: {
              link: agentLink(organizationId, agent.agentId, "run"),
              label: "Choose a desktop",
            },
          });
        continue;
      }
      if (status.state === "needs_you" && threadId === null)
        lines.push({
          key: agent.agentId,
          agentName: agent.name,
          tone: "attention",
          label: "Needs you",
          link: { link: agentLink(organizationId, agent.agentId), label: "Open Agents" },
        });
      else if (here || (!status.device.online && status.state !== "idle" && threadId === null))
        lines.push({ key: agent.agentId, agentName: agent.name, ...agentStatus(status) });
    }
    const dmAgent =
      conversation.kind === "dm" && threadId === null
        ? members.find((agent) => homed.has(agent.agentId))
        : undefined;
    return (
      <ComposerNotice
        lines={lines}
        startingTopic={newTopic.isPending}
        onNewTopic={
          dmAgent
            ? () =>
                newTopic.mutate(conversation.id, {
                  onSuccess: () => toast.success(`${dmAgent.name} starts a new topic`),
                  onError: (error) =>
                    toast.error(actionErrorMessage(error, "We couldn’t start a new topic.")),
                })
            : undefined
        }
      />
    );
  };

  return (
    <AgentWorkProvider
      render={{
        work: (message) => {
          const placed = placements.get(message.id) ?? [];
          const requestCards = cards.get(message.id) ?? [];
          const waiting = waitingItems.get(message.id) ?? [];
          const created = backlinks.get(message.id) ?? [];
          const empty = [placed, requestCards, waiting, created].every((list) => !list.length);
          if (empty) return null;
          return (
            <>
              {created.map((request) => {
                const link = proposalSourceLink(organizationId, request);
                return (
                  <ProposalBacklink key={`b${request.id}`} link={link?.link} label={link?.label} />
                );
              })}
              {waiting.map((item) => {
                const agentId = agentOf(item);
                const sameAgent = itemsByAgent.get(agentId) ?? [];
                return (
                  <InboxReceipt
                    key={item.id}
                    userId={userId}
                    organizationId={organizationId}
                    item={item}
                    context={{
                      agentName: name(agentId),
                      ahead: queueAhead(item, sameAgent),
                      busy: (homed.get(agentId)?.liveTurnIds.length ?? 0) > 0,
                    }}
                  />
                );
              })}
              {placed.map((turn) => (
                <TurnWork
                  key={turn.id}
                  userId={userId}
                  organizationId={organizationId}
                  turn={turn}
                  agentName={name(turn.userAgentId)}
                  underReply={message.fromAgent}
                  openRequest={openRequest(turn.id)}
                  uncertainItemIds={uncertainItems(turn)}
                  onTranscript={onTranscript}
                />
              ))}
              {requestCards.map((request) => (
                <RequestCard
                  key={request.id}
                  userId={userId}
                  organizationId={organizationId}
                  request={request}
                />
              ))}
            </>
          );
        },
        status: (messageId) =>
          placements
            .get(messageId)
            ?.map((turn) => (
              <TurnStatus
                key={turn.id}
                userId={userId}
                organizationId={organizationId}
                turn={turn}
                openRequest={openRequest(turn.id)}
                onTranscript={onTranscript}
              />
            )),
        badge: (messageId) => {
          if (!outputs.has(messageId)) return null;
          const latest = placements.get(messageId)?.at(-1);
          return latest ? <WorkIndicator tone={turnTone(latest, openRequest(latest.id))} /> : null;
        },
        notice,
      }}
    >
      {children}
    </AgentWorkProvider>
  );
}
