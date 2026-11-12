import {
  wakeDedupeKeys,
  type AgentWakeMessageKind,
  type AgentWakeSource,
  type AgentWakeSourceRef,
} from "@substrate/contracts/agent-work";
import { realtimeKeys, type RealtimeHint } from "@substrate/contracts/realtime";

import type { DatabaseExecutor } from "../../client";
import { actors } from "../../core/actors/schema";
import { userAgents } from "../../core/actors/user-agents.schema";
import { messageReferences } from "../../core/text/references";
import { userAgentTriggers } from "../agents/triggers.schema";
import { liveAgentMember } from "../messaging/access";
import { messagingMessages, messagingParticipants } from "../messaging/schema";
import { agentRequests } from "./requests.schema";
import { wakeKind, wakeSessionKey } from "./wake-kind";
import { agentWakes } from "./wakes.schema";
import { and, eq, inArray, isNotNull, or, sql } from "drizzle-orm";

/** An agent that a trigger may wake. */
export type AdmissionAgent = {
  actorId: string;
  organizationId: string;
  userAgentId: string;
  ownerUserId: string;
};

/** A new message. The author is a person, or an agent writing through its own actor. */
export type MessageTrigger = {
  type: "message";
  organizationId: string;
  author: { kind: "human"; userId: string } | { kind: "agent"; actorEntityId: string };
  message: { id: string; conversationId: string; threadId: string | null; body: string };
  conversationKind: "dm" | "group" | "channel";
};

/** The owner decided an agent's request: an answer, or a proposal result. */
export type RequestTrigger = {
  type: "request";
  source: "answer" | "approval_result";
  request: {
    id: string;
    organizationId: string;
    userAgentId: string;
    agentActorEntityId: string;
    ownerUserId: string;
    sessionKey: string;
  };
};

export type AdmissionTrigger = MessageTrigger | RequestTrigger;

/** What the database knows about one candidate agent for a message. */
export type MessageFacts = {
  agent: AdmissionAgent;
  mentioned: boolean;
  workedInThread: boolean;
  disabled: readonly AgentWakeMessageKind[];
};

export type RequestFacts = { agent: AdmissionAgent };

/** One trigger and the facts about one candidate agent. `type` is the trigger's type. */
export type AdmissionInput =
  | { type: "message"; trigger: MessageTrigger; facts: MessageFacts }
  | { type: "request"; trigger: RequestTrigger; facts: RequestFacts };

export type AdmissionDenial = "agent_author" | "not_owner" | "not_triggered";

export type AdmissionDecision =
  | { type: "deny"; reason: AdmissionDenial }
  | {
      type: "admit";
      source: AgentWakeSource;
      sourceRef: AgentWakeSourceRef;
      sessionKey: string;
      dedupeKey: string;
    };

/**
 * Decides whether a trigger wakes one agent. Pure: every server wake rule is here.
 *
 * - Agent-written messages never wake, which also stops agent-to-agent loops.
 * - Only the agent's owner wakes it: the agent works on the owner's desktop with the owner's access.
 * - A message wakes for the first matching kind in agentTriggerPrecedence (mention, then DM, then a
 *   reply in a thread the agent worked in). A disabled kind stops the wake; it does not fall back.
 * - The owner's answer or proposal result always wakes the agent in the request's session.
 */
export function decideAdmission(input: AdmissionInput): AdmissionDecision {
  if (input.type === "request") {
    const { request, source } = input.trigger;
    return {
      type: "admit",
      source,
      sourceRef: { requestId: request.id },
      sessionKey: request.sessionKey,
      dedupeKey:
        source === "answer"
          ? wakeDedupeKeys.answer(request.id)
          : wakeDedupeKeys.approval(request.id),
    };
  }
  const { trigger, facts } = input;
  const { author, message, conversationKind } = trigger;
  if (author.kind === "agent") return { type: "deny", reason: "agent_author" };
  if (author.userId !== facts.agent.ownerUserId) return { type: "deny", reason: "not_owner" };
  const kind = wakeKind({
    mentioned: facts.mentioned,
    directMessage: conversationKind === "dm",
    workedInThread: facts.workedInThread,
    disabled: facts.disabled,
  });
  if (!kind) return { type: "deny", reason: "not_triggered" };
  return {
    type: "admit",
    source: "owner_message",
    sourceRef: {
      messageId: message.id,
      conversationId: message.conversationId,
      threadId: message.threadId,
      kind,
    },
    sessionKey: wakeSessionKey(conversationKind, message),
    dedupeKey: wakeDedupeKeys.message(message.id),
  };
}

// Agents that already worked in this thread: they published a reply there or asked there.
async function agentsThatWorked(
  db: DatabaseExecutor,
  message: MessageTrigger["message"],
  agents: AdmissionAgent[],
) {
  if (!message.threadId) return new Set<string>();
  const replied = await db
    .selectDistinct({ actorId: messagingMessages.authorActorEntityId })
    .from(messagingMessages)
    .where(
      and(
        eq(messagingMessages.conversationId, message.conversationId),
        or(
          eq(messagingMessages.id, message.threadId),
          eq(messagingMessages.threadId, message.threadId),
        ),
        isNotNull(messagingMessages.originTurnId),
        inArray(
          messagingMessages.authorActorEntityId,
          agents.map((agent) => agent.actorId),
        ),
      ),
    );
  const asked = await db
    .selectDistinct({ actorId: agentRequests.agentActorEntityId })
    .from(agentRequests)
    .where(
      and(
        eq(agentRequests.conversationId, message.conversationId),
        eq(agentRequests.threadId, message.threadId),
        inArray(
          agentRequests.userAgentId,
          agents.map((agent) => agent.userAgentId),
        ),
      ),
    );
  return new Set([...replied, ...asked].map((row) => row.actorId));
}

// Candidates are the author's own live agents in the conversation's organization. An agent
// author has none: decideAdmission denies it anyway, so no query runs for it.
async function messageInputs(
  db: DatabaseExecutor,
  trigger: MessageTrigger,
): Promise<AdmissionInput[]> {
  if (trigger.author.kind !== "human") return [];
  const { message } = trigger;
  const agents = await db
    .select({
      actorId: actors.entityId,
      organizationId: actors.organizationId,
      userAgentId: userAgents.id,
      ownerUserId: userAgents.userId,
      disabled: sql<AgentWakeMessageKind[]>`coalesce((
        select array_agg(${userAgentTriggers.kind}) from ${userAgentTriggers}
        where ${userAgentTriggers.userAgentId} = ${userAgents.id} and not ${userAgentTriggers.enabled}
      ), '{}')`,
    })
    .from(messagingParticipants)
    .innerJoin(actors, eq(actors.entityId, messagingParticipants.actorEntityId))
    .innerJoin(userAgents, eq(userAgents.id, actors.userAgentId))
    .where(
      and(
        liveAgentMember(message.conversationId),
        eq(userAgents.userId, trigger.author.userId),
        eq(actors.organizationId, trigger.organizationId),
      ),
    );
  if (!agents.length) return [];
  const mentioned = new Set(
    messageReferences(message.body)
      .filter((reference) => reference.kind === "agent")
      .map((reference) => reference.id),
  );
  const worked = await agentsThatWorked(db, message, agents);
  return agents.map(({ disabled, ...agent }) => ({
    type: "message",
    trigger,
    facts: {
      agent,
      mentioned: mentioned.has(agent.actorId),
      workedInThread: worked.has(agent.actorId),
      disabled,
    },
  }));
}

function requestInput(trigger: RequestTrigger): AdmissionInput {
  const { request } = trigger;
  return {
    type: "request",
    trigger,
    facts: {
      agent: {
        actorId: request.agentActorEntityId,
        organizationId: request.organizationId,
        userAgentId: request.userAgentId,
        ownerUserId: request.ownerUserId,
      },
    },
  };
}

/**
 * Gathers facts for each trigger, decides with decideAdmission, and inserts the admitted wakes.
 * Runs in the caller's transaction. A wake that already exists for the agent and dedupe key is
 * kept. Returns realtime hints for owners who got a new wake, to publish after commit.
 */
export async function admit(
  db: DatabaseExecutor,
  triggers: AdmissionTrigger[],
): Promise<RealtimeHint[]> {
  const inputs: AdmissionInput[] = [];
  for (const trigger of triggers)
    inputs.push(
      ...(trigger.type === "message" ? await messageInputs(db, trigger) : [requestInput(trigger)]),
    );
  const wakes = inputs.flatMap((input) => {
    const decision = decideAdmission(input);
    if (decision.type !== "admit") return [];
    const { agent } = input.facts;
    return [
      {
        organizationId: agent.organizationId,
        userAgentId: agent.userAgentId,
        agentActorEntityId: agent.actorId,
        ownerUserId: agent.ownerUserId,
        source: decision.source,
        sourceRef: decision.sourceRef,
        sessionKey: decision.sessionKey,
        dedupeKey: decision.dedupeKey,
      },
    ];
  });
  if (!wakes.length) return [];
  const created = await db
    .insert(agentWakes)
    .values(wakes)
    .onConflictDoNothing()
    .returning({ ownerUserId: agentWakes.ownerUserId });
  return [...new Set(created.map((wake) => wake.ownerUserId))].map((userId): RealtimeHint => ({
    audience: realtimeKeys.user(userId),
    domain: "agent-work",
  }));
}
