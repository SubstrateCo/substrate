import {
  invocationApprovalMs,
  invocationMachine,
  maxAdmittedInvocationsPerDay,
  maxPendingInvocationsPerCaller,
  wakeDedupeKeys,
  type AgentAuditAction,
  type AgentInvocationKind,
  type AgentWakeMessageKind,
  type AgentWakeSource,
  type AgentWakeSourceRef,
} from "@substrate/contracts/agent-work";
import type { AgentCallerPolicy } from "@substrate/contracts/agents";
import { realtimeKeys, type RealtimeHint } from "@substrate/contracts/realtime";

import type { DatabaseExecutor } from "../../client";
import { actors } from "../../core/actors/schema";
import { userAgents } from "../../core/actors/user-agents.schema";
import { member } from "../../core/organizations/schema";
import { messageReferences } from "../../core/text/references";
import { userAgentCallers } from "../agents/callers.schema";
import { userAgentTriggers } from "../agents/triggers.schema";
import { liveAgentMember, visibleConversations } from "../messaging/access";
import {
  messagingConversations,
  messagingMessages,
  messagingParticipants,
} from "../messaging/schema";
import { audit, type AuditEvent } from "./audit";
import { agentAuditEvents, agentInvocations } from "./invocations.schema";
import { inStates } from "./machine-sql";
import { agentRequests } from "./requests.schema";
import { wakeKind, wakeSessionKey } from "./wake-kind";
import { agentWakes } from "./wakes.schema";
import { and, count, eq, gt, inArray, isNotNull, or, sql } from "drizzle-orm";

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

/** The owner approved a pending call. */
export type InvocationTrigger = {
  type: "invocation";
  invocation: {
    id: string;
    organizationId: string;
    userAgentId: string;
    agentActorEntityId: string;
    ownerUserId: string;
    sessionKey: string;
  };
};

export type AdmissionTrigger = MessageTrigger | RequestTrigger | InvocationTrigger;

/**
 * What the database knows about a message's author as a caller of someone else's agent. Present
 * only when the author is a person other than the owner and the agent's policy is not owner.
 */
export type CallerFacts = {
  policy: Exclude<AgentCallerPolicy, "owner">;
  /** The author is a member of the agent's organization, with a person actor there. */
  member: boolean;
  /** The author's person actor in the agent's organization. */
  actorId: string | null;
  /** The agent's owner can see the conversation now. */
  ownerCanSee: boolean;
  allowlisted: boolean;
  /**
   * The agent published a reply in this thread in a turn that answered an admitted call of this
   * caller in this thread. An ask alone, or a reply to someone else, does not count.
   */
  answeredInThread: boolean;
  /** The caller's calls of this agent that wait for the owner. */
  pending: number;
  /** The agent's caller calls admitted in the last 24 hours. */
  admittedToday: number;
  /** The ID the invocation gets if this decision records one. */
  invocationId: string;
};

/** What the database knows about one candidate agent for a message. */
export type MessageFacts = {
  agent: AdmissionAgent;
  mentioned: boolean;
  workedInThread: boolean;
  disabled: readonly AgentWakeMessageKind[];
  caller?: CallerFacts;
};

export type RequestFacts = { agent: AdmissionAgent };

/** One trigger and the facts about one candidate agent. `type` is the trigger's type. */
export type AdmissionInput =
  | { type: "message"; trigger: MessageTrigger; facts: MessageFacts }
  | { type: "request"; trigger: RequestTrigger; facts: RequestFacts }
  | { type: "invocation"; trigger: InvocationTrigger; facts: RequestFacts };

export type AdmissionDenial =
  | "agent_author"
  | "not_owner"
  | "not_member"
  | "direct_message"
  | "owner_cannot_see"
  | "not_triggered"
  | "rate_limited";

/** A call to record: the invocation machine event that inserts it, and its snapshot. */
export type InvocationRecord = {
  id: string;
  event: "admit" | "hold" | "limit";
  kind: AgentInvocationKind;
  policy: Exclude<AgentCallerPolicy, "owner">;
  allowlisted: boolean;
};

export type AdmissionDecision =
  | { type: "deny"; reason: AdmissionDenial; invocation?: InvocationRecord }
  | { type: "needs_approval"; sessionKey: string; invocation: InvocationRecord }
  | {
      type: "admit";
      source: AgentWakeSource;
      sourceRef: AgentWakeSourceRef;
      sessionKey: string;
      dedupeKey: string;
      invocation?: InvocationRecord;
    };

// Callers wake for a mention, or for a reply in a thread where the agent answered them.
function callerDecision(
  trigger: MessageTrigger,
  facts: MessageFacts,
  caller: CallerFacts,
): AdmissionDecision {
  const { message, conversationKind } = trigger;
  if (!caller.member || !caller.actorId) return { type: "deny", reason: "not_member" };
  if (conversationKind === "dm") return { type: "deny", reason: "direct_message" };
  if (!caller.ownerCanSee) return { type: "deny", reason: "owner_cannot_see" };
  const kind = wakeKind({
    mentioned: facts.mentioned,
    directMessage: false,
    workedInThread: caller.answeredInThread,
    disabled: facts.disabled,
  });
  // A caller's kind is never direct_message: DMs were denied above.
  if (!kind || kind === "direct_message") return { type: "deny", reason: "not_triggered" };
  const record = { id: caller.invocationId, kind, policy: caller.policy };
  const sessionKey = wakeSessionKey(conversationKind, message);
  const runsNow = caller.policy === "anyone" || caller.allowlisted;
  const limited = runsNow
    ? caller.admittedToday >= maxAdmittedInvocationsPerDay
    : caller.pending >= maxPendingInvocationsPerCaller;
  if (limited)
    return {
      type: "deny",
      reason: "rate_limited",
      invocation: { ...record, event: "limit", allowlisted: caller.allowlisted },
    };
  const invocation = { ...record, allowlisted: caller.allowlisted };
  if (!runsNow)
    return { type: "needs_approval", sessionKey, invocation: { ...invocation, event: "hold" } };
  return {
    type: "admit",
    source: "caller_message",
    sourceRef: { invocationId: caller.invocationId },
    sessionKey,
    dedupeKey: wakeDedupeKeys.call(caller.invocationId),
    invocation: { ...invocation, event: "admit" },
  };
}

/**
 * Decides whether a trigger wakes one agent. Pure: every server wake rule is here.
 *
 * - Agent-written messages never wake, which also stops agent-to-agent loops.
 * - The owner's message wakes for the first matching kind in agentTriggerPrecedence (mention,
 *   then DM, then a reply in a thread the agent worked in). A disabled kind stops the wake; it
 *   does not fall back.
 * - Another person wakes the agent only as a caller: the agent's policy is not owner, the person
 *   is a member of the agent's organization, the conversation is a channel or group that the
 *   owner can see, and the message mentions the agent or replies in a thread where the agent
 *   answered that person. The owner's disabled kinds apply. Under ask, a caller who is not
 *   allowlisted waits for the owner's approval. Excess calls are recorded as rate limited.
 * - The owner's answer or proposal result always wakes the agent in the request's session, and
 *   an approved call wakes it in the call's session.
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
  if (input.type === "invocation") {
    const { invocation } = input.trigger;
    return {
      type: "admit",
      source: "caller_message",
      sourceRef: { invocationId: invocation.id },
      sessionKey: invocation.sessionKey,
      dedupeKey: wakeDedupeKeys.call(invocation.id),
    };
  }
  const { trigger, facts } = input;
  const { author, message, conversationKind } = trigger;
  if (author.kind === "agent") return { type: "deny", reason: "agent_author" };
  if (author.userId !== facts.agent.ownerUserId)
    return facts.caller
      ? callerDecision(trigger, facts, facts.caller)
      : { type: "deny", reason: "not_owner" };
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

const admittedStates = [invocationMachine.events.admit.to, invocationMachine.events.drop.to];

// The facts about the author as a caller of one agent that accepts callers.
async function callerFacts(
  db: DatabaseExecutor,
  trigger: MessageTrigger & { author: { kind: "human" } },
  agent: AdmissionAgent,
  policy: CallerFacts["policy"],
  person: { actorId: string } | undefined,
): Promise<CallerFacts> {
  const { message } = trigger;
  const callerUserId = trigger.author.userId;
  const ofAgent = eq(agentInvocations.userAgentId, agent.userAgentId);
  const ofCaller = and(ofAgent, eq(agentInvocations.callerUserId, callerUserId));
  const [row] = await db
    .select({
      ownerCanSee: sql<boolean>`coalesce(${visibleConversations(db, {
        userId: agent.ownerUserId,
        organizationId: agent.organizationId,
      })}, false)`,
      allowlisted: sql<boolean>`exists (${db
        .select({ id: userAgentCallers.callerUserId })
        .from(userAgentCallers)
        .where(
          and(
            eq(userAgentCallers.userAgentId, agent.userAgentId),
            eq(userAgentCallers.organizationId, agent.organizationId),
            eq(userAgentCallers.callerUserId, callerUserId),
          ),
        )})`,
      pending: sql<number>`(${db
        .select({ n: count() })
        .from(agentInvocations)
        .where(
          and(
            ofCaller,
            eq(agentInvocations.status, invocationMachine.events.hold.to),
            gt(agentInvocations.expiresAt, sql`now()`),
          ),
        )})::int`,
      admittedToday: sql<number>`(${db
        .select({ n: count() })
        .from(agentInvocations)
        .where(
          and(
            ofAgent,
            inStates(agentInvocations.status, admittedStates),
            gt(agentInvocations.decidedAt, sql`now() - interval '1 day'`),
          ),
        )})::int`,
      // The agent published a reply in this thread, and the reply's audit row ties it to an
      // admitted call of this caller in this thread.
      answeredInThread: message.threadId
        ? sql<boolean>`exists (${db
            .select({ id: messagingMessages.id })
            .from(messagingMessages)
            .innerJoin(
              agentAuditEvents,
              and(
                eq(agentAuditEvents.userAgentId, agent.userAgentId),
                eq(agentAuditEvents.action, "mcp_call"),
                eq(agentAuditEvents.tool, "reply"),
                eq(agentAuditEvents.result, "ok"),
                eq(agentAuditEvents.turnId, messagingMessages.originTurnId),
                sql`${agentAuditEvents.targetIds} @> jsonb_build_array(${messagingMessages.id}::text)`,
              ),
            )
            .innerJoin(agentInvocations, eq(agentInvocations.id, agentAuditEvents.invocationId))
            .where(
              and(
                eq(messagingMessages.conversationId, message.conversationId),
                or(
                  eq(messagingMessages.id, message.threadId),
                  eq(messagingMessages.threadId, message.threadId),
                ),
                eq(messagingMessages.authorActorEntityId, agent.actorId),
                isNotNull(messagingMessages.originTurnId),
                ofCaller,
                eq(agentInvocations.conversationId, message.conversationId),
                or(
                  eq(agentInvocations.threadId, message.threadId),
                  eq(agentInvocations.messageId, message.threadId),
                ),
                inStates(agentInvocations.status, admittedStates),
              ),
            )})`
        : sql<boolean>`false`,
    })
    .from(messagingConversations)
    .where(eq(messagingConversations.id, message.conversationId));
  return {
    policy,
    member: !!person,
    actorId: person?.actorId ?? null,
    ownerCanSee: row?.ownerCanSee ?? false,
    allowlisted: row?.allowlisted ?? false,
    answeredInThread: row?.answeredInThread ?? false,
    pending: row?.pending ?? 0,
    admittedToday: row?.admittedToday ?? 0,
    invocationId: crypto.randomUUID(),
  };
}

// Candidates are the live agents in the conversation's organization. An agent author has none:
// decideAdmission denies it anyway, so no query runs for it. Caller facts are read only for
// agents of other owners whose policy accepts callers.
async function messageInputs(
  db: DatabaseExecutor,
  trigger: MessageTrigger,
): Promise<AdmissionInput[]> {
  if (trigger.author.kind !== "human") return [];
  const author = trigger.author;
  const { message } = trigger;
  const rows = await db
    .select({
      actorId: actors.entityId,
      organizationId: actors.organizationId,
      userAgentId: userAgents.id,
      ownerUserId: userAgents.userId,
      callerPolicy: userAgents.callerPolicy,
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
        eq(actors.organizationId, trigger.organizationId),
        or(eq(userAgents.userId, author.userId), sql`${userAgents.callerPolicy} <> 'owner'`),
      ),
    );
  if (!rows.length) return [];
  const mentioned = new Set(
    messageReferences(message.body)
      .filter((reference) => reference.kind === "agent")
      .map((reference) => reference.id),
  );
  const agents = rows.map((row) => ({
    actorId: row.actorId,
    organizationId: row.organizationId,
    userAgentId: row.userAgentId,
    ownerUserId: row.ownerUserId,
  }));
  const worked = await agentsThatWorked(db, message, agents);
  const calls = rows.some((row) => row.ownerUserId !== author.userId);
  // The author's person actor, only while they are a member of the organization.
  const [person] = calls
    ? await db
        .select({ actorId: actors.entityId })
        .from(actors)
        .innerJoin(
          member,
          and(eq(member.userId, actors.userId), eq(member.organizationId, actors.organizationId)),
        )
        .where(
          and(
            eq(actors.organizationId, trigger.organizationId),
            eq(actors.userId, author.userId),
            eq(actors.type, "human"),
          ),
        )
    : [];
  const inputs: AdmissionInput[] = [];
  for (const { disabled, callerPolicy, ...agent } of rows) {
    const facts: MessageFacts = {
      agent,
      mentioned: mentioned.has(agent.actorId),
      workedInThread: worked.has(agent.actorId),
      disabled,
    };
    if (agent.ownerUserId !== author.userId && callerPolicy !== "owner")
      facts.caller = await callerFacts(db, { ...trigger, author }, agent, callerPolicy, person);
    inputs.push({ type: "message", trigger, facts });
  }
  return inputs;
}

function requestInput(trigger: RequestTrigger | InvocationTrigger): AdmissionInput {
  const source = trigger.type === "request" ? trigger.request : trigger.invocation;
  const facts = {
    agent: {
      actorId: source.agentActorEntityId,
      organizationId: source.organizationId,
      userAgentId: source.userAgentId,
      ownerUserId: source.ownerUserId,
    },
  };
  return trigger.type === "request"
    ? { type: "request", trigger, facts }
    : { type: "invocation", trigger, facts };
}

const auditActions: Record<InvocationRecord["event"], AgentAuditAction> = {
  admit: "invocation_admitted",
  hold: "invocation_held",
  limit: "invocation_rate_limited",
};

// Records the calls that the decisions name. A message records one call per agent; a call that
// already exists is kept, and only newly recorded calls may wake.
async function recordInvocations(
  db: DatabaseExecutor,
  decided: { input: AdmissionInput; decision: AdmissionDecision }[],
) {
  const rows = decided.flatMap(({ input, decision }) => {
    const record = decision.invocation;
    if (!record || input.type !== "message" || !input.facts.caller?.actorId) return [];
    const { agent } = input.facts;
    const { message, author, conversationKind } = input.trigger;
    if (author.kind !== "human") return [];
    const status = invocationMachine.events[record.event].to;
    return [
      {
        id: record.id,
        organizationId: agent.organizationId,
        userAgentId: agent.userAgentId,
        agentActorEntityId: agent.actorId,
        ownerUserId: agent.ownerUserId,
        callerUserId: author.userId,
        callerActorEntityId: input.facts.caller.actorId,
        messageId: message.id,
        conversationId: message.conversationId,
        threadId: message.threadId,
        kind: record.kind,
        policy: record.policy,
        allowlisted: record.allowlisted,
        status,
        sessionKey: wakeSessionKey(conversationKind, message),
        decidedAt: record.event === "hold" ? null : sql`now()`,
        expiresAt: sql`now() + ${`${invocationApprovalMs} milliseconds`}::interval`,
      },
    ];
  });
  if (!rows.length) return { recorded: new Set<string>(), hints: [] };
  const inserted = await db.insert(agentInvocations).values(rows).onConflictDoNothing().returning({
    id: agentInvocations.id,
    organizationId: agentInvocations.organizationId,
    userAgentId: agentInvocations.userAgentId,
    ownerUserId: agentInvocations.ownerUserId,
    callerUserId: agentInvocations.callerUserId,
    messageId: agentInvocations.messageId,
  });
  const events = new Map(
    decided.flatMap(({ decision }) =>
      decision.invocation ? [[decision.invocation.id, decision.invocation.event] as const] : [],
    ),
  );
  await audit(
    db,
    inserted.map((row): AuditEvent => ({
      organizationId: row.organizationId,
      userAgentId: row.userAgentId,
      ownerUserId: row.ownerUserId,
      action: auditActions[events.get(row.id)!],
      invocationId: row.id,
      callerUserId: row.callerUserId,
      targetIds: [row.messageId],
    })),
  );
  // The owner sees new calls in Needs you and the Calls log; the caller sees their call status.
  const hints = inserted.flatMap((row): RealtimeHint[] => [
    { audience: realtimeKeys.user(row.ownerUserId), domain: "agent-work" },
    { audience: realtimeKeys.user(row.callerUserId), domain: "agent-work" },
  ]);
  return { recorded: new Set(inserted.map((row) => row.id)), hints };
}

/**
 * Gathers facts for each trigger, decides with decideAdmission, records caller calls, and
 * inserts the admitted wakes. Runs in the caller's transaction. A wake that already exists for
 * the agent and dedupe key is kept. Returns data-less realtime hints, to publish after commit:
 * owners who got a new wake or call, and callers whose call was recorded.
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
  const decided = inputs.map((input) => ({ input, decision: decideAdmission(input) }));
  const { recorded, hints } = await recordInvocations(db, decided);
  const wakes = decided.flatMap(({ input, decision }) => {
    if (decision.type !== "admit") return [];
    if (decision.invocation && !recorded.has(decision.invocation.id)) return [];
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
  const created = wakes.length
    ? await db.insert(agentWakes).values(wakes).onConflictDoNothing().returning({
        id: agentWakes.id,
        ownerUserId: agentWakes.ownerUserId,
        sourceRef: agentWakes.sourceRef,
      })
    : [];
  for (const wake of created)
    if ("invocationId" in wake.sourceRef)
      await db
        .update(agentInvocations)
        .set({ wakeId: wake.id })
        .where(eq(agentInvocations.id, wake.sourceRef.invocationId));
  const owners = [...new Set(created.map((wake) => wake.ownerUserId))].map(
    (userId): RealtimeHint => ({ audience: realtimeKeys.user(userId), domain: "agent-work" }),
  );
  const unique = new Map(
    [...owners, ...hints].map((hint) => [JSON.stringify(hint), hint] as const),
  );
  return [...unique.values()];
}
