import type { AgentAuditEventView } from "@substrate/contracts/agent-work";

import type { DatabaseExecutor } from "../../client";
import { actors } from "../../core/actors/schema";
import { userAgents } from "../../core/actors/user-agents.schema";
import type { SessionIdentity } from "../../core/session/identity";
import { workspaceContext } from "../../core/session/workspace";
import { AccessDeniedError } from "../../errors";
import { agentAuditEvents } from "./invocations.schema";
import { and, desc, eq } from "drizzle-orm";

export type AuditEvent = typeof agentAuditEvents.$inferInsert;

/** Appends audit rows. Rows are never changed or removed by the application. */
export async function audit(db: DatabaseExecutor, events: AuditEvent[]) {
  if (events.length) await db.insert(agentAuditEvents).values(events);
}

/** The owner's Calls log of one agent in this organization, newest first. Owner only. */
export function listCallsLog(db: DatabaseExecutor, identity: SessionIdentity, userAgentId: string) {
  return db.transaction(async (tx): Promise<AgentAuditEventView[]> => {
    await workspaceContext(tx, identity);
    const [owned] = await tx
      .select({ id: userAgents.id })
      .from(userAgents)
      .where(and(eq(userAgents.id, userAgentId), eq(userAgents.userId, identity.userId)));
    if (!owned) throw new AccessDeniedError();
    const rows = await tx
      .select({ event: agentAuditEvents, callerActorId: actors.entityId })
      .from(agentAuditEvents)
      .leftJoin(
        actors,
        and(
          eq(actors.organizationId, agentAuditEvents.organizationId),
          eq(actors.userId, agentAuditEvents.callerUserId),
        ),
      )
      .where(
        and(
          eq(agentAuditEvents.userAgentId, userAgentId),
          eq(agentAuditEvents.ownerUserId, identity.userId),
          eq(agentAuditEvents.organizationId, identity.organizationId),
        ),
      )
      .orderBy(desc(agentAuditEvents.createdAt), desc(agentAuditEvents.id))
      .limit(200);
    return rows.map(({ event, callerActorId }) => ({
      id: event.id,
      userAgentId: event.userAgentId,
      action: event.action,
      actorUserId: event.actorUserId,
      invocationId: event.invocationId,
      callerActorId,
      tool: event.tool,
      access: event.access,
      targetIds: event.targetIds,
      result: event.result,
      turnId: event.turnId,
      createdAt: event.createdAt.toISOString(),
    }));
  });
}
