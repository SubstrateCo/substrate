import type {
  AgentRequestView,
  AgentStatusView,
  AgentWorkItemView,
  AgentWorkTurnView,
} from "@substrate/contracts/agent-work";

import { useQuery } from "@tanstack/react-query";

import type { ReactNode } from "react";

import { AgentWorkProvider } from "./agent-work-slot";
import { ComposerNotice, type ComposerNoticeLine } from "./composer-notice";
import { InboxReceipt } from "./inbox-receipt";
import { ProposalBacklink } from "./requests/proposal-backlink";
import { RequestCard } from "./requests/request-card";
import { TurnLabel, TurnStatus, TurnWork } from "./turn-work";
import { useVisibleTurnStatuses } from "./use-visible-turn-statuses";
import { WorkIndicator } from "./work-indicator";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import { noticeLines, noticeThread } from "@/lib/agent-work/composer-notice";
import { conversationAgents } from "@/lib/agent-work/conversation-agents";
import { proposalSourceLink } from "@/lib/agent-work/links";
import {
  itemPlacements,
  queuedReplyItems,
  requestPlacements,
  turnPlacements,
} from "@/lib/agent-work/placement";
import { isOpenRequest } from "@/lib/agent-work/requests";
import {
  agentStatus,
  noDesktopLabel,
  queueAhead,
  turnMood,
  turnTone,
  waits,
} from "@/lib/agent-work/status";
import type { Conversation } from "@/lib/messaging/conversations";
import { agentLink } from "@/lib/navigation/record-links";
import {
  agentStatusOptions,
  conversationRequestsOptions,
  conversationWorkOptions,
} from "@/queries/agent-work/server";
import { agentCatalogQueryOptions } from "@/queries/agents/catalog";

function messageWorkLookups(
  turns: readonly AgentWorkTurnView[],
  items: readonly AgentWorkItemView[],
  requests: readonly AgentRequestView[],
  agentOf: (item: AgentWorkItemView) => string,
) {
  // The first open request of each turn.
  const openRequests = new Map<string, AgentRequestView>();
  for (const request of requests)
    if (isOpenRequest(request) && !openRequests.has(request.turnId))
      openRequests.set(request.turnId, request);
  const outputs = new Set(
    turns.flatMap((turn) =>
      turn.outputs.flatMap((entry) => (entry.kind === "message" ? [entry.id] : [])),
    ),
  );
  const itemsByAgent = new Map<string, AgentWorkItemView[]>();
  const uncertainIds: string[] = [];
  for (const item of items) {
    if (item.status === "uncertain") uncertainIds.push(item.id);
    const agentId = agentOf(item);
    const list = itemsByAgent.get(agentId);
    if (list) list.push(item);
    else itemsByAgent.set(agentId, [item]);
  }
  return {
    openRequest: (turnId: string) => openRequests.get(turnId),
    outputs,
    itemsByAgent,
    uncertainIds,
  };
}

function uncertainItemsForTurn(turn: AgentWorkTurnView, uncertainIds: readonly string[]) {
  if (turn.attentionReason !== "uncertain_input" || !uncertainIds.length) return undefined;
  const turnItems = new Set(turn.itemIds);
  return uncertainIds.filter((id) => turnItems.has(id));
}

/** The first status listed for each agent. */
function statusIndex(statuses: readonly AgentStatusView[] | undefined) {
  if (!statuses?.length) return undefined;
  const index = new Map<string, AgentStatusView>();
  for (const status of statuses)
    if (!index.has(status.userAgentId)) index.set(status.userAgentId, status);
  return index;
}

/**
 * The owner's agent work in one conversation, for the channel and the thread pane. The server
 * returns work, requests and status only to the owner, on any of the owner's devices.
 *
 * Work loads whether or not the agent is still a member, so an agent that left still shows its
 * open requests and turns here.
 */
export function ConversationAgentWork({
  conversation,
  onTranscript,
  children,
}: {
  conversation: Conversation;
  onTranscript: (turnId: string) => void;
  children: ReactNode;
}) {
  const { userId, organizationId } = useWorkspaceScope();
  const { offscreen, onVisibilityChange } = useVisibleTurnStatuses();
  // Members list agent IDs only for the viewer's own agents.
  const members = conversation.members.flatMap((member) =>
    member.type === "agent" && member.agentId
      ? [{ agentId: member.agentId, name: member.name }]
      : [],
  );
  const work = useQuery(conversationWorkOptions(userId, organizationId, conversation.id));
  const requests = useQuery(conversationRequestsOptions(userId, organizationId, conversation.id));
  const { data: statuses } = useQuery(agentStatusOptions(userId, organizationId));
  const statusByAgent = statusIndex(statuses);
  const turns = work.data?.turns ?? [];
  const sessions = new Map((work.data?.sessions ?? []).map((session) => [session.id, session]));
  const items = work.data?.items ?? [];

  const agents = conversationAgents({
    conversationId: conversation.id,
    members,
    turns,
    requests: requests.data ?? [],
    statuses: statuses ?? [],
  });
  const name = (agentId: string) =>
    agents.find((agent) => agent.agentId === agentId)?.name ?? "Agent";
  // Agent work is the owner's, so the owner's catalog has every agent here.
  const { data: catalog } = useQuery(agentCatalogQueryOptions(userId));
  const avatarOf = (agentId: string) =>
    catalog?.agents.find((agent) => agent.id === agentId)?.avatar ?? null;
  const { placements, anchors } = turnPlacements(turns, conversation.id);
  const waitingItems = itemPlacements(items, turns, conversation.id);
  const { cards, backlinks } = requestPlacements(requests.data ?? [], anchors, conversation.id);
  const agentOf = (item: AgentWorkItemView) => sessions.get(item.sessionId)?.userAgentId ?? "";
  const { openRequest, outputs, itemsByAgent, uncertainIds } = messageWorkLookups(
    turns,
    items,
    requests.data ?? [],
    agentOf,
  );
  const queuedReplies = queuedReplyItems(items);
  /** The latest work behind an agent's reply, or undefined for other messages. */
  const replyTurn = (messageId: string) =>
    outputs.has(messageId) ? placements.get(messageId)?.at(-1) : undefined;

  const notice = (threadId: string | null) => {
    const lines = noticeLines({
      conversationId: conversation.id,
      threadId,
      agents,
      turns,
      threadOf: (turn) =>
        noticeThread(sessions.get(turn.sessionId)?.origin?.threadId ?? null, anchors.get(turn.id)),
      statuses: statusByAgent,
    })
      .filter((line) => line.kind !== "turn" || offscreen.has(line.turn.id))
      .map((line): ComposerNoticeLine => {
        const { agentId, name: agentName } = line.agent;
        const avatar = avatarOf(agentId);
        if (line.kind === "turn") {
          const request = openRequest(line.turn.id);
          return {
            key: agentId,
            turnId: line.turn.id,
            agentName,
            avatar,
            tone: turnTone(line.turn, request),
            mood: turnMood(line.turn, request),
            label: <TurnLabel turn={line.turn} openRequest={request} />,
            status: (
              <TurnStatus turn={line.turn} openRequest={request} onTranscript={onTranscript} />
            ),
          };
        }
        if (line.kind === "no_desktop")
          return {
            key: agentId,
            agentName,
            avatar,
            tone: "idle",
            label: noDesktopLabel,
            link: {
              link: agentLink(organizationId, agentId, { settings: "overview" }),
              label: "Choose a desktop",
            },
          };
        if (line.kind === "needs_you")
          return {
            key: agentId,
            agentName,
            avatar,
            tone: "attention",
            label: "Needs you",
            link: { link: agentLink(organizationId, agentId), label: "Open Agents" },
          };
        const status = agentStatus(line.status);
        return {
          key: agentId,
          agentName,
          avatar,
          ...status,
          mood: status.tone === "working" ? "working" : null,
        };
      });
    // New topic is hidden for now; `useNewTopic` and the command stay in place.
    return <ComposerNotice lines={lines} startingTopic={false} />;
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
                const asReply = queuedReplies.has(item.id);
                // The session's newest waiting message carries the queued reply row.
                if (waits(item) && !asReply) return null;
                const agentId = agentOf(item);
                const sameAgent = itemsByAgent.get(agentId) ?? [];
                const status = statusByAgent?.get(agentId);
                return (
                  <InboxReceipt
                    key={item.id}
                    item={item}
                    agentId={agentId}
                    asReply={asReply}
                    context={{
                      agentName: name(agentId),
                      ahead: queueAhead(item, sameAgent),
                      busy: status?.state === "working",
                      device: status?.device,
                    }}
                  />
                );
              })}
              {placed.map((turn) => (
                <TurnWork
                  key={turn.id}
                  turn={turn}
                  agentName={name(turn.userAgentId)}
                  underReply={message.fromAgent}
                  openRequest={openRequest(turn.id)}
                  uncertainItemIds={uncertainItemsForTurn(turn, uncertainIds)}
                  onTranscript={onTranscript}
                  onVisibilityChange={onVisibilityChange}
                />
              ))}
              {requestCards.map((request) => (
                <RequestCard key={request.id} request={request} />
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
                turn={turn}
                openRequest={openRequest(turn.id)}
                onTranscript={onTranscript}
                onVisibilityChange={onVisibilityChange}
              />
            )),
        badge: (messageId) => {
          const turn = replyTurn(messageId);
          // Live work shows in the avatar's mood instead.
          if (!turn || turnMood(turn, openRequest(turn.id))) return null;
          return <WorkIndicator tone={turnTone(turn, openRequest(turn.id))} />;
        },
        mood: (messageId) => {
          const turn = replyTurn(messageId);
          return turn ? turnMood(turn, openRequest(turn.id)) : null;
        },
        pendingReply: (messageId) =>
          (placements.get(messageId) ?? []).some(
            (turn) => turnTone(turn, openRequest(turn.id)) !== "muted",
          ) || (waitingItems.get(messageId) ?? []).some((item) => queuedReplies.has(item.id)),
        notice,
      }}
    >
      {children}
    </AgentWorkProvider>
  );
}
