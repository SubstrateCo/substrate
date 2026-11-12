import type { AgentCallerPolicy, AgentCallers, AgentCallerView } from "@substrate/contracts/agents";
import { realtimeKeys } from "@substrate/contracts/realtime";

import type { DatabaseExecutor } from "../../client";
import { activeActorCondition } from "../../core/actors/access";
import { actors } from "../../core/actors/schema";
import { userAgents } from "../../core/actors/user-agents.schema";
import { user } from "../../core/authentication/schema";
import { effectsFor } from "../../core/effects";
import type { SessionIdentity } from "../../core/session/identity";
import { workspaceContext } from "../../core/session/workspace";
import { AccessDeniedError, ValidationError } from "../../errors";
import { audit } from "../agent-work/audit";
import { cancelPendingInvocations } from "../agent-work/invocations";
import { agentRefreshHints } from "../realtime/routing";
import { userAgentCallers } from "./callers.schema";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";

// Caller settings belong to the agent's owner. Every function checks the session's membership,
// that the agent is the owner's own, and that the agent has an actor in this organization.

async function requireOwnedAgent(db: DatabaseExecutor, identity: SessionIdentity, agentId: string) {
  await workspaceContext(db, identity);
  const [agent] = await db
    .select({ id: userAgents.id, policy: userAgents.callerPolicy })
    .from(userAgents)
    .innerJoin(
      actors,
      and(
        eq(actors.userAgentId, userAgents.id),
        eq(actors.organizationId, identity.organizationId),
      ),
    )
    .where(
      and(
        eq(userAgents.id, agentId),
        eq(userAgents.userId, identity.userId),
        isNull(userAgents.deletedAt),
      ),
    );
  if (!agent) throw new AccessDeniedError();
  return agent;
}

async function changed(db: DatabaseExecutor, identity: SessionIdentity) {
  for (const hint of await agentRefreshHints(db, identity.userId)) effectsFor(db).hint(hint);
  effectsFor(db).hint({ audience: realtimeKeys.user(identity.userId), domain: "agent-work" });
}

/**
 * Sets who may call the agent. Switching to owner only cancels its pending calls; calls already
 * admitted drop at the home desktop's source check. Running turns are not stopped.
 */
export function saveCallerPolicy(
  db: DatabaseExecutor,
  identity: SessionIdentity,
  agentId: string,
  policy: AgentCallerPolicy,
) {
  return db.transaction((tx) => saveCallerPolicyInTransaction(tx, identity, agentId, policy));
}

export async function saveCallerPolicyInTransaction(
  tx: DatabaseExecutor,
  identity: SessionIdentity,
  agentId: string,
  policy: AgentCallerPolicy,
) {
  let agent = await requireOwnedAgent(tx, identity, agentId);
  for (;;) {
    if (agent.policy === policy) return null;
    const updated = await tx
      .update(userAgents)
      .set({ callerPolicy: policy })
      .where(
        and(
          eq(userAgents.id, agent.id),
          eq(userAgents.userId, identity.userId),
          isNull(userAgents.deletedAt),
          eq(userAgents.callerPolicy, agent.policy),
        ),
      )
      .returning({ id: userAgents.id });
    if (updated.length) break;
    // Another policy change won. Read its value before retrying so the audit stays correct.
    agent = await requireOwnedAgent(tx, identity, agentId);
  }
  await audit(tx, [
    {
      organizationId: identity.organizationId,
      userAgentId: agent.id,
      ownerUserId: identity.userId,
      action: "policy_changed",
      actorUserId: identity.userId,
      targetIds: [agent.policy, policy],
    },
  ]);
  if (policy === "owner") await cancelPendingInvocations(tx, agent.id, identity.userId);
  await changed(tx, identity);
  return null;
}

/** The agent's policy and its allowlist in this organization. */
export function listCallers(db: DatabaseExecutor, identity: SessionIdentity, agentId: string) {
  return db.transaction(async (tx): Promise<AgentCallers> => {
    await workspaceContext(tx, identity);
    return queryCallers(tx, identity, agentId);
  });
}

export async function queryCallers(
  db: DatabaseExecutor,
  identity: SessionIdentity,
  agentId: string,
): Promise<AgentCallers> {
  const ownedActor = db
    .select({ id: actors.userAgentId })
    .from(actors)
    .where(eq(actors.organizationId, identity.organizationId));
  const rows = await db
    .select({
      policy: userAgents.callerPolicy,
      actorId: userAgentCallers.callerActorEntityId,
      name: sql<string>`${user.name}`,
      createdAt: userAgentCallers.createdAt,
    })
    .from(userAgents)
    .leftJoin(
      userAgentCallers,
      and(
        eq(userAgentCallers.userAgentId, userAgents.id),
        eq(userAgentCallers.organizationId, identity.organizationId),
      ),
    )
    .leftJoin(
      actors,
      and(
        eq(actors.organizationId, userAgentCallers.organizationId),
        eq(actors.entityId, userAgentCallers.callerActorEntityId),
      ),
    )
    .leftJoin(user, eq(user.id, actors.userId))
    .where(
      and(
        eq(userAgents.id, agentId),
        eq(userAgents.userId, identity.userId),
        isNull(userAgents.deletedAt),
        inArray(userAgents.id, ownedActor),
      ),
    )
    .orderBy(asc(userAgentCallers.createdAt));
  if (!rows.length) throw new AccessDeniedError();
  return {
    policy: rows[0]!.policy,
    allowlist: rows.flatMap((row): AgentCallerView[] =>
      row.actorId && row.createdAt
        ? [
            {
              actorId: row.actorId,
              name: row.name,
              createdAt: row.createdAt.toISOString(),
            },
          ]
        : [],
    ),
  };
}

/** Lets a person of this organization call the agent without approval under ask. */
export function allowCaller(
  db: DatabaseExecutor,
  identity: SessionIdentity,
  agentId: string,
  callerActorId: string,
) {
  return db.transaction((tx) => allowCallerInTransaction(tx, identity, agentId, callerActorId));
}

export async function allowCallerInTransaction(
  tx: DatabaseExecutor,
  identity: SessionIdentity,
  agentId: string,
  callerActorId: string,
) {
  const agent = await requireOwnedAgent(tx, identity, agentId);
  const [person] = await tx
    .select({ actorId: actors.entityId, userId: actors.userId })
    .from(actors)
    .where(
      and(
        eq(actors.organizationId, identity.organizationId),
        eq(actors.entityId, callerActorId),
        eq(actors.type, "human"),
        activeActorCondition(),
      ),
    );
  if (!person?.userId) throw new AccessDeniedError();
  if (person.userId === identity.userId)
    throw new ValidationError("You can always call your own agent.");
  const added = await tx
    .insert(userAgentCallers)
    .values({
      organizationId: identity.organizationId,
      userAgentId: agent.id,
      ownerUserId: identity.userId,
      callerUserId: person.userId,
      callerActorEntityId: person.actorId,
    })
    .onConflictDoNothing()
    .returning({ id: userAgentCallers.callerUserId });
  if (added.length) {
    await audit(tx, [
      {
        organizationId: identity.organizationId,
        userAgentId: agent.id,
        ownerUserId: identity.userId,
        action: "caller_allowed",
        actorUserId: identity.userId,
        callerUserId: person.userId,
        targetIds: [person.actorId],
      },
    ]);
    await changed(tx, identity);
  }
  return null;
}

/** Removes a person from the allowlist. Their admitted calls drop at the source check. */
export function removeCaller(
  db: DatabaseExecutor,
  identity: SessionIdentity,
  agentId: string,
  callerActorId: string,
) {
  return db.transaction((tx) => removeCallerInTransaction(tx, identity, agentId, callerActorId));
}

export async function removeCallerInTransaction(
  tx: DatabaseExecutor,
  identity: SessionIdentity,
  agentId: string,
  callerActorId: string,
) {
  const agent = await requireOwnedAgent(tx, identity, agentId);
  const removed = await tx
    .delete(userAgentCallers)
    .where(
      and(
        eq(userAgentCallers.userAgentId, agent.id),
        eq(userAgentCallers.organizationId, identity.organizationId),
        eq(userAgentCallers.callerActorEntityId, callerActorId),
      ),
    )
    .returning({ userId: userAgentCallers.callerUserId });
  if (removed.length) {
    await audit(tx, [
      {
        organizationId: identity.organizationId,
        userAgentId: agent.id,
        ownerUserId: identity.userId,
        action: "caller_removed",
        actorUserId: identity.userId,
        callerUserId: removed[0]!.userId,
        targetIds: [callerActorId],
      },
    ]);
    await changed(tx, identity);
  }
  return null;
}
