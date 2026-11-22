import {
  callStatus,
  invocationMachine,
  withheldCallerWakeMs,
  type AgentCallStatusView,
  type AgentDesktopUpdateView,
  type AgentInvocationDropReason,
  type AgentInvocationView,
  type DecideInvocationInput,
} from "@substrate/contracts/agent-work";
import { realtimeKeys, type RealtimeHint } from "@substrate/contracts/realtime";

import { activeActorCondition } from "../../core/actors/access";
import { actors } from "../../core/actors/schema";
import { userAgents } from "../../core/actors/user-agents.schema";
import { user } from "../../core/authentication/schema";
import { effectsFor } from "../../core/effects";
import type { DatabaseExecutor } from "../../core/executor";
import type { SessionIdentity } from "../../core/session/identity";
import { workspaceContext } from "../../core/session/workspace";
import { AccessDeniedError, ConflictError } from "../../errors";
import { userAgentCallers } from "../agents/callers.schema";
import { userAgentTriggers } from "../agents/triggers.schema";
import { visibleConversations } from "../messaging/access";
import { conversationDisplayName } from "../messaging/display-name";
import {
  messagingConversations,
  messagingMessages,
  messagingParticipants,
} from "../messaging/schema";
import { admit } from "./admission";
import { audit, type AuditEvent } from "./audit";
import { agentAuditEvents, agentInvocations } from "./invocations.schema";
import { inStates } from "./machine-sql";
import { agentWakes } from "./wakes.schema";
import {
  and,
  count,
  desc,
  eq,
  exists,
  gt,
  inArray,
  isNotNull,
  isNull,
  lte,
  max,
  sql,
  type SQL,
  type SQLWrapper,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

type InvocationRow = typeof agentInvocations.$inferSelect;

const previewLength = 200;
const closed = "This call was already decided or has expired.";

/** A pending call that can still be decided: the CAS condition of approve, decline and cancel. */
const decidable = (event: "approve" | "decline" | "cancel") =>
  and(
    inStates(agentInvocations.status, invocationMachine.from(event)),
    gt(agentInvocations.expiresAt, sql`now()`),
  );

/** Hints without data: the owner's work lists, and the caller's own call status. */
function invocationHints(rows: Pick<InvocationRow, "ownerUserId" | "callerUserId">[]) {
  return rows.flatMap((row): RealtimeHint[] => [
    { audience: realtimeKeys.user(row.ownerUserId), domain: "agent-work" },
    { audience: realtimeKeys.user(row.callerUserId), domain: "agent-work" },
  ]);
}

function hint(db: DatabaseExecutor, rows: Pick<InvocationRow, "ownerUserId" | "callerUserId">[]) {
  for (const value of invocationHints(rows)) effectsFor(db).hint(value);
}

const auditOf = (
  row: InvocationRow,
  action: AuditEvent["action"],
  actorUserId: string | null,
): AuditEvent => ({
  organizationId: row.organizationId,
  userAgentId: row.userAgentId,
  ownerUserId: row.ownerUserId,
  action,
  actorUserId,
  invocationId: row.id,
  callerUserId: row.callerUserId,
  targetIds: [row.messageId],
});

const checkedInvocation = alias(agentInvocations, "checked_invocation");

/**
 * Whether a call may still run, read now: the agent is enabled and its policy accepts callers,
 * the caller is an active member who can see the conversation, the owner can see it, the agent
 * is still a live member, and the message is not deleted. `approved` reports whether the policy
 * lets this call run without a new decision: anyone, an owner approval, or the allowlist. A
 * concurrent policy change may commit after this read, as if the check ran before the change.
 */
async function callChecks(db: DatabaseExecutor, rows: InvocationRow[]) {
  const checks = new Map<
    string,
    { reachable: boolean; approved: boolean; triggerEnabled: boolean }
  >();
  if (!rows.length) return checks;
  const row = checkedInvocation;
  const visibleTo = (userId: SQLWrapper) =>
    exists(
      db
        .select({ id: messagingConversations.id })
        .from(messagingConversations)
        .where(
          and(
            eq(messagingConversations.id, row.conversationId),
            visibleConversations(db, { userId, organizationId: row.organizationId }),
          ),
        ),
    );
  const checked = await db
    .select({
      id: row.id,
      decidedByUserId: row.decidedByUserId,
      policy: userAgents.callerPolicy,
      triggerEnabled: sql<boolean>`not exists (${db
        .select({ kind: userAgentTriggers.kind })
        .from(userAgentTriggers)
        .where(
          and(
            eq(userAgentTriggers.userAgentId, row.userAgentId),
            eq(userAgentTriggers.kind, row.kind),
            eq(userAgentTriggers.enabled, false),
          ),
        )})`,
      allowlisted: sql<boolean>`${exists(
        db
          .select({ id: userAgentCallers.callerUserId })
          .from(userAgentCallers)
          .where(
            and(
              eq(userAgentCallers.userAgentId, row.userAgentId),
              eq(userAgentCallers.organizationId, row.organizationId),
              eq(userAgentCallers.callerUserId, row.callerUserId),
            ),
          ),
      )}`,
      reachable: sql<boolean>`(${exists(
        db
          .select({ id: actors.entityId })
          .from(actors)
          .where(
            and(
              eq(actors.organizationId, row.organizationId),
              eq(actors.entityId, row.callerActorEntityId),
              activeActorCondition(),
            ),
          ),
      )} AND ${visibleTo(row.callerUserId)} AND ${visibleTo(row.ownerUserId)} AND ${exists(
        db
          .select({ id: messagingParticipants.actorEntityId })
          .from(messagingParticipants)
          .innerJoin(actors, eq(actors.entityId, messagingParticipants.actorEntityId))
          .where(
            and(
              eq(messagingParticipants.conversationId, row.conversationId),
              eq(messagingParticipants.actorType, "agent"),
              isNull(messagingParticipants.leftAt),
              activeActorCondition(),
              eq(messagingParticipants.actorEntityId, row.agentActorEntityId),
            ),
          ),
      )} AND ${exists(
        db
          .select({ id: messagingMessages.id })
          .from(messagingMessages)
          .where(and(eq(messagingMessages.id, row.messageId), isNull(messagingMessages.deletedAt))),
      )})`,
    })
    .from(row)
    .innerJoin(userAgents, eq(userAgents.id, row.userAgentId))
    .where(
      and(
        inArray(
          row.id,
          rows.map((invocation) => invocation.id),
        ),
        eq(userAgents.userId, row.ownerUserId),
        isNull(userAgents.deletedAt),
        eq(userAgents.enabled, true),
      ),
    );
  for (const check of checked) {
    const reachable = check.policy !== "owner" && check.reachable;
    checks.set(check.id, {
      reachable,
      approved:
        reachable &&
        (check.policy === "anyone" || check.decidedByUserId !== null || check.allowlisted),
      triggerEnabled: check.triggerEnabled,
    });
  }
  return checks;
}

async function requireOwnedInvocation(
  db: DatabaseExecutor,
  identity: SessionIdentity,
  invocationId: string,
) {
  const [row] = await db
    .select()
    .from(agentInvocations)
    .where(
      and(
        eq(agentInvocations.id, invocationId),
        eq(agentInvocations.ownerUserId, identity.userId),
        eq(agentInvocations.organizationId, identity.organizationId),
      ),
    );
  if (!row) throw new AccessDeniedError();
  return row;
}

/** Moves pending calls past their expiry to expired. Returns them. */
async function expireDue(db: DatabaseExecutor, where: SQL | undefined) {
  const expired = await db
    .update(agentInvocations)
    .set({ status: invocationMachine.events.expire.to, decidedAt: sql`now()` })
    .where(
      and(
        inStates(agentInvocations.status, invocationMachine.from("expire")),
        lte(agentInvocations.expiresAt, sql`now()`),
        where,
      ),
    )
    .returning();
  await audit(
    db,
    expired.map((row) => auditOf(row, "invocation_expired", null)),
  );
  return expired;
}

type DecisionEvent = "approve" | "decline" | "cancel";

const decisionAudits: Record<DecisionEvent, AuditEvent["action"]> = {
  approve: "invocation_approved",
  decline: "invocation_declined",
  cancel: "invocation_cancelled",
};

/**
 * The owner decides a pending call. The first decision wins: each update applies only while the
 * call is pending and not expired. An approval counts toward the agent's daily cap, but the cap
 * never blocks it. Approval first checks again that the call may run (see
 * callChecks); a call that cannot is cancelled instead. An approval creates the wake in the same
 * transaction. A call whose trigger kind the owner disabled since is cancelled too. always_allow
 * also allowlists the caller.
 */
export async function decideInvocationInTransaction(
  tx: DatabaseExecutor,
  identity: SessionIdentity,
  invocationId: string,
  decision: DecideInvocationInput["decision"],
) {
  await workspaceContext(tx, identity);
  const row = await requireOwnedInvocation(tx, identity, invocationId);
  let event: DecisionEvent = "decline";
  if (decision !== "decline") {
    const checked = (await callChecks(tx, [row])).get(row.id);
    event = checked?.reachable && checked.triggerEnabled ? "approve" : "cancel";
  }
  const [decided] = await tx
    .update(agentInvocations)
    .set({
      status: invocationMachine.events[event].to,
      decidedAt: sql`now()`,
      decidedByUserId: event === "cancel" ? null : identity.userId,
    })
    .where(and(eq(agentInvocations.id, invocationId), decidable(event)))
    .returning();
  // Another decision won, or the call expired. Maintenance records the expiry.
  if (!decided) throw new ConflictError(closed);
  const events = [
    auditOf(decided, decisionAudits[event], event === "cancel" ? null : identity.userId),
  ];
  if (event === "approve" && decision === "always_allow") {
    const allowed = await tx
      .insert(userAgentCallers)
      .values({
        organizationId: decided.organizationId,
        userAgentId: decided.userAgentId,
        ownerUserId: decided.ownerUserId,
        callerUserId: decided.callerUserId,
        callerActorEntityId: decided.callerActorEntityId,
      })
      .onConflictDoNothing()
      .returning({ id: userAgentCallers.callerUserId });
    if (allowed.length) events.push(auditOf(decided, "caller_allowed", identity.userId));
  }
  await audit(tx, events);
  if (event === "approve") {
    for (const value of await admit(tx, [{ type: "invocation", invocation: decided }]))
      effectsFor(tx).hint(value);
  }
  hint(tx, [decided]);
  return { status: decided.status };
}

/**
 * Cancels an agent's pending calls after updating its policy to owner only in this transaction.
 * A concurrent admission missed by this update is cancelled at decision time or expires.
 */
export async function cancelPendingInvocations(
  db: DatabaseExecutor,
  userAgentId: string,
  ownerUserId: string,
) {
  const cancelled = await db
    .update(agentInvocations)
    .set({ status: invocationMachine.events.cancel.to, decidedAt: sql`now()` })
    .where(
      and(
        eq(agentInvocations.userAgentId, userAgentId),
        eq(agentInvocations.ownerUserId, ownerUserId),
        inStates(agentInvocations.status, invocationMachine.from("cancel")),
      ),
    )
    .returning();
  await audit(
    db,
    cancelled.map((row) => auditOf(row, "invocation_cancelled", ownerUserId)),
  );
  hint(db, cancelled);
  return cancelled.length;
}

/** Drops admitted calls with a reason, through the drop event, with audit rows and hints. */
async function dropInvocations(
  db: DatabaseExecutor,
  ids: string[],
  reason: AgentInvocationDropReason,
) {
  if (!ids.length) return [];
  const changed = await db
    .update(agentInvocations)
    .set({ status: invocationMachine.events.drop.to, dropReason: reason })
    .where(
      and(
        inArray(agentInvocations.id, ids),
        inStates(agentInvocations.status, invocationMachine.from("drop")),
      ),
    )
    .returning();
  await audit(
    db,
    changed.map((row) => ({ ...auditOf(row, "invocation_dropped", null), result: reason })),
  );
  hint(db, changed);
  return changed;
}

/**
 * Drops admitted calls that may not run any more, when the home desktop checks their sources:
 * the policy, the allowlist, the caller's membership or access, or the owner's trigger toggle
 * for the call's kind changed. Returns the IDs of
 * the calls that may not run, including unknown ones, and the messages on each side.
 */
export async function revokedInvocations(
  db: DatabaseExecutor,
  owner: { userId: string; organizationId: string },
  invocationIds: string[],
) {
  const none: string[] = [];
  if (!invocationIds.length)
    return { revoked: none, allowed: new Set<string>(), blocked: new Set<string>() };
  const rows = await db
    .select()
    .from(agentInvocations)
    .where(
      and(
        inArray(agentInvocations.id, invocationIds),
        eq(agentInvocations.ownerUserId, owner.userId),
        eq(agentInvocations.organizationId, owner.organizationId),
      ),
    );
  const allowed = new Map<string, string>();
  const dropped: InvocationRow[] = [];
  const checks = await callChecks(
    db,
    rows.filter((row) => row.status === invocationMachine.events.admit.to),
  );
  for (const row of rows) {
    if (row.status !== invocationMachine.events.admit.to) continue;
    const checked = checks.get(row.id);
    if (checked?.reachable && checked.approved && checked.triggerEnabled)
      allowed.set(row.id, row.messageId);
    else dropped.push(row);
  }
  await dropInvocations(
    db,
    dropped.map((row) => row.id),
    "revoked",
  );
  const allowedMessages = new Set(allowed.values());
  return {
    revoked: [...new Set(invocationIds)].filter((id) => !allowed.has(id)),
    /** Messages of calls that may run. */
    allowed: allowedMessages,
    /** Messages of calls that may not run, unless another named call of them may. */
    blocked: new Set(
      rows.flatMap((row) =>
        allowed.has(row.id) || allowedMessages.has(row.messageId) ? [] : [row.messageId],
      ),
    ),
  };
}

/**
 * Calls as the owner sees them now. The place, names and preview show only while the owner can
 * open the conversation; otherwise the place is a placeholder. A pending call past its expiry
 * shows as expired.
 */
export async function invocationViews(
  db: DatabaseExecutor,
  identity: SessionIdentity,
  where: SQL | undefined,
): Promise<AgentInvocationView[]> {
  const agent = alias(actors, "invocation_agent");
  const caller = alias(actors, "invocation_caller");
  const rows = await db
    .select({
      invocation: agentInvocations,
      agentName: sql<string>`coalesce(${userAgents.name}, 'Agent')`,
      callerName: user.name,
      conversationName: sql<
        string | null
      >`case when ${messagingConversations.id} is null then null else ${conversationDisplayName(db, identity)} end`,
      body: messagingMessages.body,
      deletedAt: messagingMessages.deletedAt,
      expired: sql<boolean>`${agentInvocations.expiresAt} <= now()`,
    })
    .from(agentInvocations)
    .innerJoin(
      agent,
      and(
        eq(agent.organizationId, agentInvocations.organizationId),
        eq(agent.entityId, agentInvocations.agentActorEntityId),
      ),
    )
    .innerJoin(
      caller,
      and(
        eq(caller.organizationId, agentInvocations.organizationId),
        eq(caller.entityId, agentInvocations.callerActorEntityId),
      ),
    )
    .leftJoin(userAgents, eq(userAgents.id, agent.userAgentId))
    .innerJoin(user, eq(user.id, caller.userId))
    .leftJoin(
      messagingConversations,
      and(
        eq(messagingConversations.id, agentInvocations.conversationId),
        visibleConversations(db, identity),
      ),
    )
    .leftJoin(messagingMessages, eq(messagingMessages.id, agentInvocations.messageId))
    .where(
      and(
        eq(agentInvocations.ownerUserId, identity.userId),
        eq(agentInvocations.organizationId, identity.organizationId),
        where,
      ),
    )
    .orderBy(desc(agentInvocations.createdAt), desc(agentInvocations.id))
    .limit(100);
  return rows.map(
    ({ invocation, agentName, callerName, conversationName, body, deletedAt, expired }) => {
      const status =
        invocation.status === invocationMachine.events.hold.to && expired
          ? invocationMachine.events.expire.to
          : invocation.status;
      const visible = conversationName !== null;
      return {
        id: invocation.id,
        userAgentId: invocation.userAgentId,
        agent: { actorId: invocation.agentActorEntityId, name: agentName },
        caller: { actorId: invocation.callerActorEntityId, name: callerName },
        kind: invocation.kind,
        status,
        dropReason: invocation.dropReason,
        policy: invocation.policy,
        allowlisted: invocation.allowlisted,
        place: visible
          ? {
              access: "visible",
              conversationId: invocation.conversationId,
              threadId: invocation.threadId,
              conversationName,
              anchorMessageId: invocation.messageId,
            }
          : { access: "hidden" },
        preview: visible && body !== null && !deletedAt ? body.slice(0, previewLength) : null,
        createdAt: invocation.createdAt.toISOString(),
        decidedAt: invocation.decidedAt?.toISOString() ?? null,
        expiresAt: invocation.expiresAt.toISOString(),
      };
    },
  );
}

/** Pending calls that the owner can still decide. */
export const awaitingOwner = and(
  inStates(agentInvocations.status, invocationMachine.from("approve")),
  gt(agentInvocations.expiresAt, sql`now()`),
);

/**
 * The caller's own calls on their messages in one conversation they can see now. Nothing for a
 * conversation they cannot open. Callers learn only waiting, queued, answered, declined or
 * expired. A call is answered once a reply that the agent published for it is audited.
 */
export async function queryMyCalls(
  db: DatabaseExecutor,
  identity: SessionIdentity,
  conversationId: string,
): Promise<AgentCallStatusView[]> {
  const agent = alias(actors, "call_agent");
  const rows = await db
    .select({
      invocation: agentInvocations,
      agentName: userAgents.name,
      expired: sql<boolean>`${agentInvocations.expiresAt} <= now()`,
      answered: exists(
        db
          .select({ id: agentAuditEvents.id })
          .from(agentAuditEvents)
          .where(
            and(
              eq(agentAuditEvents.invocationId, agentInvocations.id),
              eq(agentAuditEvents.userAgentId, agentInvocations.userAgentId),
              eq(agentAuditEvents.action, "mcp_call"),
              eq(agentAuditEvents.tool, "reply"),
              eq(agentAuditEvents.result, "ok"),
            ),
          ),
      ).mapWith(Boolean),
    })
    .from(agentInvocations)
    .innerJoin(
      agent,
      and(
        eq(agent.organizationId, agentInvocations.organizationId),
        eq(agent.entityId, agentInvocations.agentActorEntityId),
      ),
    )
    .innerJoin(userAgents, eq(userAgents.id, agent.userAgentId))
    .innerJoin(
      messagingConversations,
      and(
        eq(messagingConversations.id, agentInvocations.conversationId),
        visibleConversations(db, identity),
      ),
    )
    .where(
      and(
        eq(agentInvocations.conversationId, conversationId),
        eq(agentInvocations.callerUserId, identity.userId),
        eq(agentInvocations.organizationId, identity.organizationId),
      ),
    )
    .orderBy(desc(agentInvocations.createdAt), desc(agentInvocations.id))
    .limit(200);
  return rows.map(({ invocation, agentName, expired, answered }) => ({
    invocationId: invocation.id,
    messageId: invocation.messageId,
    agent: { actorId: invocation.agentActorEntityId, name: agentName },
    status: callStatus(invocation.status, {
      expired,
      answered,
      dropReason: invocation.dropReason,
    }),
    updatedAt: (invocation.decidedAt ?? invocation.createdAt).toISOString(),
  }));
}

/** Expires pending calls past their expiry, in batches, for maintenance. */
export async function expireInvocations(db: DatabaseExecutor, limit: number) {
  const expired = await db.transaction((tx) =>
    expireDue(
      tx,
      inArray(
        agentInvocations.id,
        tx
          .select({ id: agentInvocations.id })
          .from(agentInvocations)
          .where(
            and(
              inStates(agentInvocations.status, invocationMachine.from("expire")),
              lte(agentInvocations.expiresAt, sql`now()`),
            ),
          )
          .limit(limit),
      ),
    ),
  );
  return expired.length;
}

/**
 * Drops the calls of caller wakes that waited longer than withheldCallerWakeMs for agents homed
 * on a desktop that pulls without caller_wakes. Only that desktop's pull proves it cannot run
 * them, so this runs there and not in maintenance. The wakes are removed; the calls drop with
 * reason desktop_needs_update, and the owner sees desktopUpdateRequired in Needs you.
 */
export async function dropWithheldCallerWakes(db: DatabaseExecutor, homedAgents: SQL) {
  const removed = await db
    .delete(agentWakes)
    .where(
      and(
        eq(agentWakes.source, "caller_message"),
        isNull(agentWakes.ackedAt),
        lte(agentWakes.createdAt, sql`now() - ${`${withheldCallerWakeMs} milliseconds`}::interval`),
        homedAgents,
      ),
    )
    .returning({ sourceRef: agentWakes.sourceRef });
  const ids = removed.flatMap(({ sourceRef }) =>
    "invocationId" in sourceRef ? [sourceRef.invocationId] : [],
  );
  return (await dropInvocations(db, ids, "desktop_needs_update")).length;
}

const signalDays = 7;

/**
 * The owner's agents with calls dropped for desktop_needs_update in the last 7 days, unless a
 * desktop stored a caller wake of the agent after the last such drop.
 */
export async function desktopUpdateViews(
  db: DatabaseExecutor,
  identity: SessionIdentity,
): Promise<AgentDesktopUpdateView[]> {
  const agent = alias(actors, "update_agent");
  const rows = await db
    .select({
      userAgentId: agentInvocations.userAgentId,
      actorId: agentInvocations.agentActorEntityId,
      name: sql<string>`coalesce(${userAgents.name}, 'Agent')`,
      droppedCalls: count(),
      lastDroppedAt: max(agentAuditEvents.createdAt),
    })
    .from(agentInvocations)
    .innerJoin(
      agentAuditEvents,
      and(
        eq(agentAuditEvents.invocationId, agentInvocations.id),
        eq(agentAuditEvents.action, "invocation_dropped"),
        eq(agentAuditEvents.result, "desktop_needs_update"),
      ),
    )
    .innerJoin(
      agent,
      and(
        eq(agent.organizationId, agentInvocations.organizationId),
        eq(agent.entityId, agentInvocations.agentActorEntityId),
      ),
    )
    .leftJoin(userAgents, eq(userAgents.id, agent.userAgentId))
    .where(
      and(
        eq(agentInvocations.ownerUserId, identity.userId),
        eq(agentInvocations.organizationId, identity.organizationId),
        eq(agentInvocations.dropReason, "desktop_needs_update"),
        gt(agentAuditEvents.createdAt, sql`now() - ${`${signalDays} days`}::interval`),
      ),
    )
    .groupBy(
      agentInvocations.userAgentId,
      agentInvocations.agentActorEntityId,
      agent.entityId,
      agent.organizationId,
      userAgents.id,
    );
  if (!rows.length) return [];
  // A caller wake stored after the last drop shows the agent's desktop runs caller calls now.
  const stored = await db
    .select({ userAgentId: agentWakes.userAgentId, ackedAt: max(agentWakes.ackedAt) })
    .from(agentWakes)
    .where(
      and(
        inArray(
          agentWakes.userAgentId,
          rows.map((row) => row.userAgentId),
        ),
        eq(agentWakes.source, "caller_message"),
        isNotNull(agentWakes.ackedAt),
      ),
    )
    .groupBy(agentWakes.userAgentId);
  const storedAt = new Map(stored.map((row) => [row.userAgentId, row.ackedAt]));
  return rows.flatMap((row) => {
    const acked = storedAt.get(row.userAgentId);
    if (!row.lastDroppedAt || (acked && acked > row.lastDroppedAt)) return [];
    return [
      {
        userAgentId: row.userAgentId,
        agent: { actorId: row.actorId, name: row.name },
        droppedCalls: row.droppedCalls,
        lastDroppedAt: row.lastDroppedAt.toISOString(),
      },
    ];
  });
}
