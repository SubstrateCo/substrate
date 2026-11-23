import type { AgentAuditEventView } from "@substrate/contracts/agent-work";

import { actors } from "../../../core/actors/schema";
import { userAgents } from "../../../core/actors/user-agents.schema";
import type { DatabaseExecutor } from "../../../core/executor";
import type { SessionIdentity } from "../../../core/session/identity";
import { AccessDeniedError } from "../../../errors";
import { agentAuditEvents } from "./invocations.schema";
import { and, desc, eq } from "drizzle-orm";

export type AuditEvent = typeof agentAuditEvents.$inferInsert;

/** Appends audit rows. Rows are never changed or removed by the application. */
export async function audit(db: DatabaseExecutor, events: AuditEvent[]) {
  if (events.length) await db.insert(agentAuditEvents).values(events);
}

/** The owner's Calls log of one agent in this organization, newest first. Owner only. */
export async function queryCallsLog(
  db: DatabaseExecutor,
  identity: SessionIdentity,
  userAgentId: string,
): Promise<AgentAuditEventView[]> {
  const rows = await db
    .select({ event: agentAuditEvents, callerActorId: actors.entityId })
    .from(userAgents)
    .leftJoin(
      agentAuditEvents,
      and(
        eq(agentAuditEvents.userAgentId, userAgents.id),
        eq(agentAuditEvents.ownerUserId, identity.userId),
        eq(agentAuditEvents.organizationId, identity.organizationId),
      ),
    )
    .leftJoin(
      actors,
      and(
        eq(actors.organizationId, agentAuditEvents.organizationId),
        eq(actors.userId, agentAuditEvents.callerUserId),
      ),
    )
    .where(and(eq(userAgents.id, userAgentId), eq(userAgents.userId, identity.userId)))
    .orderBy(desc(agentAuditEvents.createdAt), desc(agentAuditEvents.id))
    .limit(200);
  if (!rows.length) throw new AccessDeniedError();
  return rows.flatMap(({ event, callerActorId }) =>
    event
      ? [
          {
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
          },
        ]
      : [],
  );
}
