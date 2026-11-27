import type { TurnPlace } from "@substrate/contracts/agent-tools";
import {
  parseSessionKey,
  sessionKeys,
  wakeDedupeKeys,
  type InboxSource,
  type InboxSourceRef,
  type TurnStatus,
} from "@substrate/contracts/agent-work";
import type { AgentTriggerKind } from "@substrate/contracts/agents";
import type { TurnKind } from "@substrate/contracts/harness-runtime";
import { isDirectConversation, type ConversationKind } from "@substrate/contracts/messaging/input";
import { realtimeKeys, type RealtimeHint } from "@substrate/contracts/realtime";

import type { DatabaseExecutor } from "../../../core/executor";
import { messageReferences } from "../../../core/text/references";
import { homeDeviceOf } from "../home";
import { enqueue, setItemStatus, type ItemRow } from "../items";
import { ensureSession, type AgentRef, type EnsureSessionInput } from "../sessions";
import { agentWorkItems } from "../work-items.schema";
import { messageInputs, requestPlace } from "./facts";
import { wakeKind, wakeSessionKey } from "./wake-kind";
import { and, eq, ne } from "drizzle-orm";

/** Passive thread messages join a live turn for this long after it started. */
const passiveWindowMs = 10 * 60_000;
/** Passive thread batches per turn. */
const passiveBatchBudget = 20;

/** A new message. The author is a person, or an agent writing through its own actor. */
export type MessageTrigger = {
  type: "message";
  organizationId: string;
  author: { kind: "human"; userId: string } | { kind: "agent"; actorEntityId: string };
  message: {
    id: string;
    conversationId: string;
    threadId: string | null;
    body: string;
    createdAt: Date;
  };
  conversationKind: ConversationKind;
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
    anchorMessageId: string | null;
    conversationId: string | null;
  };
};

/** A routine's due occurrence, from the server scheduler. */
type RoutineTrigger = {
  type: "routine";
  agent: AgentRef;
  routine: { id: string; revision: number; prompt: string; destination: TurnPlace };
  scheduledAt: string;
};

/** A session that admission adds an item to. */
type ExistingSession = { id: string; key: string; parentSessionId?: string | null } & AgentRef;

/** A helper's task or parent message, in its session, or its report, in its parent's session. */
type HelperTrigger = {
  type: "helper";
  source: "helper_task" | "helper_result";
  helperId: string;
  session: ExistingSession;
  body: string;
  dedupeKey: string;
};

/** Work the agent's host creates itself: an epoch handoff, or a turn's resume note. */
export type HostTrigger = {
  type: "host";
  /**
   * The device that submits the item, or null when the server ends a lost turn itself, such as
   * after its lease expired or its agent moved.
   */
  deviceId: string | null;
  session: ExistingSession;
  body: string;
} & (
  | { source: "epoch"; fromEpoch: number }
  | { source: "recovery"; turn: { id: string; attempt: number } }
);

export type AdmissionTrigger =
  | MessageTrigger
  | RequestTrigger
  | RoutineTrigger
  | HelperTrigger
  | HostTrigger;

/** An agent that a trigger may give work. */
type AdmissionAgent = {
  actorId: string;
  organizationId: string;
  userAgentId: string;
  ownerUserId: string;
};

/** The live turn of the agent's session for the message's thread. */
export type ThreadTurnFacts = {
  id: string;
  kind: TurnKind;
  status: TurnStatus;
  handoff: boolean;
  /** When the turn started, or was claimed when it has not started yet. */
  since: Date;
  /** Passive thread batches the turn already has. */
  passiveBatches: number;
};

/** What the database knows about one candidate agent for a message. */
export type MessageFacts = {
  agent: AdmissionAgent;
  mentioned: boolean;
  participatedInThread: boolean;
  disabled: readonly AgentTriggerKind[];
  threadTurn: ThreadTurnFacts | null;
};

/** One trigger and the facts about one candidate agent. `type` is the trigger's type. */
export type AdmissionInput =
  | { type: "message"; trigger: MessageTrigger; facts: MessageFacts }
  | { type: "request"; trigger: RequestTrigger; facts: { place: TurnPlace | null } }
  | { type: "routine"; trigger: RoutineTrigger }
  | { type: "helper"; trigger: HelperTrigger }
  | { type: "host"; trigger: HostTrigger; facts: { homeDeviceId: string | null } };

type AdmissionDenial =
  | "own_message"
  | "agent_author"
  | "not_owner"
  | "not_triggered"
  | "invalid_session"
  | "not_homed";

export type AdmissionDecision =
  | { type: "deny"; reason: AdmissionDenial }
  | {
      type: "admit";
      source: InboxSource;
      sourceRef: InboxSourceRef;
      session: EnsureSessionInput;
      dedupeKey: string;
      body: string | null;
    };

function messageKind(trigger: MessageTrigger, facts: MessageFacts) {
  const addressed = messageReferences(trigger.message.body).some(
    (reference) => reference.kind === "agent",
  );
  return wakeKind({
    mentioned: facts.mentioned,
    directMessage: isDirectConversation(trigger.conversationKind),
    workedInThread: !!trigger.message.threadId && facts.participatedInThread && !addressed,
    disabled: facts.disabled,
  });
}

const passiveStatuses: readonly TurnStatus[] = ["assigned", "running", "waiting"];

/** The passive thread_context item for the agent's live thread turn, if the message joins it. */
function threadContext(
  trigger: MessageTrigger,
  facts: MessageFacts,
): Extract<AdmissionDecision, { type: "admit" }> | null {
  const { message } = trigger;
  const turn = facts.threadTurn;
  if (!message.threadId || isDirectConversation(trigger.conversationKind) || !turn) return null;
  const joins =
    turn.kind === "interactive" &&
    !turn.handoff &&
    passiveStatuses.includes(turn.status) &&
    !facts.disabled.includes("thread_reply") &&
    turn.passiveBatches < passiveBatchBudget &&
    message.createdAt.getTime() - turn.since.getTime() < passiveWindowMs;
  if (!joins) return null;
  return {
    type: "admit",
    source: "thread_context",
    sourceRef: {
      source: "thread_context",
      messageIds: [message.id],
      targetTurnId: turn.id,
      conversationId: message.conversationId,
      threadId: message.threadId,
    },
    session: {
      key: sessionKeys.thread(message.threadId),
      kind: "thread",
      origin: { conversationId: message.conversationId, threadId: message.threadId },
    },
    dedupeKey: wakeDedupeKeys.threadContext(turn.id, message.id),
    body: null,
  };
}

function decideMessage(trigger: MessageTrigger, facts: MessageFacts): AdmissionDecision {
  const { author, message, conversationKind } = trigger;
  if (author.kind === "agent" && author.actorEntityId === facts.agent.actorId)
    return { type: "deny", reason: "own_message" };
  const kind =
    author.kind === "human" && author.userId === facts.agent.ownerUserId
      ? messageKind(trigger, facts)
      : undefined;
  if (kind) {
    const key = wakeSessionKey(conversationKind, message);
    return {
      type: "admit",
      source: "owner_message",
      sourceRef: {
        source: "owner_message",
        messageId: message.id,
        conversationId: message.conversationId,
        threadId: message.threadId,
      },
      session: {
        key,
        kind: isDirectConversation(conversationKind) ? "dm" : "thread",
        origin: {
          conversationId: message.conversationId,
          threadId: isDirectConversation(conversationKind)
            ? null
            : (message.threadId ?? message.id),
        },
      },
      dedupeKey: wakeDedupeKeys.message(message.id),
      body: null,
    };
  }
  const passive = threadContext(trigger, facts);
  if (passive) return passive;
  if (author.kind === "agent") return { type: "deny", reason: "agent_author" };
  return {
    type: "deny",
    reason: author.userId === facts.agent.ownerUserId ? "not_triggered" : "not_owner",
  };
}

function decideRequest(trigger: RequestTrigger, place: TurnPlace | null): AdmissionDecision {
  const { request, source } = trigger;
  const key = parseSessionKey(request.sessionKey);
  if (!key) return { type: "deny", reason: "invalid_session" };
  return {
    type: "admit",
    source,
    sourceRef: { source, requestId: request.id, anchorMessageId: request.anchorMessageId },
    session: { key: request.sessionKey, kind: key.kind, origin: place },
    dedupeKey:
      source === "answer" ? wakeDedupeKeys.answer(request.id) : wakeDedupeKeys.approval(request.id),
    body: null,
  };
}

/**
 * The input that finds an existing session. It repeats the helper parent: the insert that finds
 * the session checks its constraints before it sees the conflict.
 */
function existingSession(session: ExistingSession): EnsureSessionInput | null {
  const key = parseSessionKey(session.key);
  if (!key) return null;
  const { parentSessionId } = session;
  return parentSessionId
    ? { key: session.key, kind: key.kind, parentSessionId }
    : { key: session.key, kind: key.kind };
}

/**
 * Decides whether a trigger gives one agent work, and which item. Pure: every rule that creates
 * agent work is here.
 *
 * - The agent's own messages never give it work.
 * - Only the owner's own messages start the agent's work. The owner's message admits an
 *   owner_message item for the first matching kind in agentTriggerPrecedence (mention, then DM,
 *   then an untargeted follow-up in a thread it joined). A disabled kind stops it; it does not
 *   fall back.
 * - Any other message in a thread, from a person or another agent, is passive context: a
 *   thread_context item that joins the agent's live interactive turn of that thread, while the
 *   thread follow-up trigger is on, within 10 minutes of the turn's start and 20 batches. It
 *   never starts a turn.
 * - The owner's answer or proposal result always admits an item in the request's session.
 * - Routine occurrences and helper tasks and reports are admitted in their sessions.
 * - Work the host submits, epoch handoffs and resume notes, is admitted only from the agent's
 *   home device. The server's own resume notes for lost turns need no device.
 */
export function decideAdmission(input: AdmissionInput): AdmissionDecision {
  switch (input.type) {
    case "message":
      return decideMessage(input.trigger, input.facts);
    case "request":
      return decideRequest(input.trigger, input.facts.place);
    case "routine": {
      const { routine, scheduledAt } = input.trigger;
      return {
        type: "admit",
        source: "routine",
        sourceRef: {
          source: "routine",
          routineId: routine.id,
          revision: routine.revision,
          scheduledAt,
        },
        session: {
          key: sessionKeys.routine(routine.id),
          kind: "routine",
          destination: routine.destination,
        },
        dedupeKey: wakeDedupeKeys.routine(routine.id, routine.revision, scheduledAt),
        body: routine.prompt,
      };
    }
    case "helper": {
      const { trigger } = input;
      const session = existingSession(trigger.session);
      if (!session) return { type: "deny", reason: "invalid_session" };
      return {
        type: "admit",
        source: trigger.source,
        sourceRef: { source: trigger.source, helperId: trigger.helperId },
        session,
        dedupeKey: trigger.dedupeKey,
        body: trigger.body,
      };
    }
    case "host": {
      const { trigger, facts } = input;
      if (trigger.deviceId !== null && facts.homeDeviceId !== trigger.deviceId)
        return { type: "deny", reason: "not_homed" };
      const session = existingSession(trigger.session);
      if (!session) return { type: "deny", reason: "invalid_session" };
      return trigger.source === "epoch"
        ? {
            type: "admit",
            source: "epoch",
            sourceRef: { source: "epoch", fromEpoch: trigger.fromEpoch },
            session,
            dedupeKey: wakeDedupeKeys.epoch(trigger.session.id, trigger.fromEpoch),
            body: trigger.body,
          }
        : {
            type: "admit",
            source: "recovery",
            sourceRef: { source: "recovery", turnId: trigger.turn.id },
            session,
            dedupeKey: wakeDedupeKeys.recovery(trigger.turn.id, trigger.turn.attempt),
            body: trigger.body,
          };
    }
  }
}

const agentOf = (agent: {
  organizationId: string;
  userAgentId: string;
  ownerUserId: string;
  actorId?: string;
  agentActorEntityId?: string;
}): AgentRef => ({
  organizationId: agent.organizationId,
  userAgentId: agent.userAgentId,
  ownerUserId: agent.ownerUserId,
  agentActorEntityId: agent.agentActorEntityId ?? agent.actorId!,
});

async function inputsFor(
  db: DatabaseExecutor,
  trigger: AdmissionTrigger,
): Promise<{ agent: AgentRef; input: AdmissionInput }[]> {
  switch (trigger.type) {
    case "message":
      return (await messageInputs(db, trigger)).map((input) => ({
        agent: agentOf(input.facts.agent),
        input,
      }));
    case "request":
      return [
        {
          agent: agentOf(trigger.request),
          input: { type: "request", trigger, facts: { place: requestPlace(trigger) } },
        },
      ];
    case "routine":
      return [{ agent: trigger.agent, input: { type: "routine", trigger } }];
    case "helper":
      return [{ agent: agentOf(trigger.session), input: { type: "helper", trigger } }];
    case "host": {
      const homeDeviceId = await homeDeviceOf(db, trigger.session.userAgentId);
      return [
        {
          agent: agentOf(trigger.session),
          input: { type: "host", trigger, facts: { homeDeviceId } },
        },
      ];
    }
  }
}

/** A newer occurrence of a routine replaces its older ticks that no turn took yet. */
async function supersedeOlderTicks(db: DatabaseExecutor, item: ItemRow) {
  if (item.source !== "routine") return;
  const older = await db
    .select({ id: agentWorkItems.id })
    .from(agentWorkItems)
    .where(
      and(
        eq(agentWorkItems.sessionId, item.sessionId),
        eq(agentWorkItems.source, "routine"),
        eq(agentWorkItems.status, "pending"),
        ne(agentWorkItems.id, item.id),
      ),
    );
  await setItemStatus(
    db,
    older.map((row) => row.id),
    "supersede",
  );
}

/**
 * Gathers facts for each trigger, decides with decideAdmission, and creates the admitted items,
 * with their sessions on first use. Runs in the caller's transaction. An item that already
 * exists for the agent and dedupe key is kept. Returns the new items and data-less realtime
 * hints for their owners, to publish after commit.
 */
export async function admit(
  db: DatabaseExecutor,
  triggers: AdmissionTrigger[],
  now = new Date(),
): Promise<{ items: ItemRow[]; hints: RealtimeHint[] }> {
  const items: ItemRow[] = [];
  for (const trigger of triggers)
    for (const { agent, input } of await inputsFor(db, trigger)) {
      const decision = decideAdmission(input);
      if (decision.type !== "admit") continue;
      const session = await ensureSession(db, agent, decision.session, now);
      const item = await enqueue(
        db,
        {
          session,
          source: decision.source,
          sourceRef: decision.sourceRef,
          dedupeKey: decision.dedupeKey,
          body: decision.body,
        },
        now,
      );
      if (!item) continue;
      await supersedeOlderTicks(db, item);
      items.push(item);
    }
  const owners = new Set(items.map((item) => item.ownerUserId));
  return {
    items,
    hints: [...owners].map((userId) => ({
      audience: realtimeKeys.user(userId),
      domain: "agent-work",
    })),
  };
}
