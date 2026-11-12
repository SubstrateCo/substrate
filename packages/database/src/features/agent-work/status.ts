import type { AgentStatusState, AgentStatusView } from "@substrate/contracts/agent-work";
import { realtimeKeys } from "@substrate/contracts/realtime";

import type { DatabaseExecutor } from "../../client";
import { actors } from "../../core/actors/schema";
import { userAgents } from "../../core/actors/user-agents.schema";
import { deviceOnline } from "../../core/devices/repository";
import { desktopDevices } from "../../core/devices/schema";
import { effectsFor } from "../../core/effects";
import { requireDevice, type DeviceIdentity } from "../../core/session/device";
import type { SessionIdentity } from "../../core/session/identity";
import { workspaceContext } from "../../core/session/workspace";
import { threadRoot, visibleConversationIds, visibleConversations } from "../messaging/access";
import { messagingConversations, messagingMessages } from "../messaging/schema";
import { requireHomedAgent } from "./device";
import { agentStatus } from "./status.schema";
import { toStatusView } from "./views";
import { and, asc, eq, inArray, sql, type SQL } from "drizzle-orm";

export interface PublishStatusInput {
  userAgentId: string;
  state: AgentStatusState;
  queuedCount: number;
  liveConversationId?: string;
  liveThreadId?: string;
  activity?: string;
  version: number;
}

/** The home desktop publishes an agent's status. An older or repeated version changes nothing. */
export function publishStatus(
  db: DatabaseExecutor,
  identity: DeviceIdentity,
  input: PublishStatusInput,
) {
  return db.transaction(async (tx) => {
    const device = await requireDevice(tx, identity);
    await requireHomedAgent(tx, identity, device.id, input.userAgentId);
    // A place the owner cannot open is not recorded, nor is the activity there. A thread is kept
    // only when it is a root message in the conversation.
    const { liveConversationId, liveThreadId } = input;
    const [live] = liveConversationId
      ? await tx
          .select({ id: messagingConversations.id, threadId: messagingMessages.id })
          .from(messagingConversations)
          .leftJoin(
            messagingMessages,
            liveThreadId ? threadRoot(liveConversationId, liveThreadId) : sql`false`,
          )
          .where(
            and(
              eq(messagingConversations.id, liveConversationId),
              visibleConversations(tx, identity),
            ),
          )
      : [];
    const hidden = Boolean(liveConversationId) && !live;
    const values = {
      organizationId: identity.organizationId,
      ownerUserId: identity.userId,
      state: input.state,
      queuedCount: input.queuedCount,
      liveConversationId: live?.id ?? null,
      liveThreadId: live?.threadId ?? null,
      activity: hidden ? null : (input.activity ?? null),
      version: input.version,
      updatedAt: sql`now()`,
    };
    // The CTE reads the row as it was before this statement, so the owner's views refresh only
    // when what they show changed.
    const previous = tx.$with("previous").as(
      tx
        .select({
          state: sql`${agentStatus.state}`.as("state"),
          queuedCount: sql`${agentStatus.queuedCount}`.as("queued_count"),
          liveConversationId: sql`${agentStatus.liveConversationId}`.as("live_conversation_id"),
          liveThreadId: sql`${agentStatus.liveThreadId}`.as("live_thread_id"),
          activity: sql`${agentStatus.activity}`.as("activity"),
        })
        .from(agentStatus)
        .where(eq(agentStatus.userAgentId, input.userAgentId)),
    );
    const applied = await tx
      .with(previous)
      .insert(agentStatus)
      .values({ userAgentId: input.userAgentId, ...values })
      .onConflictDoUpdate({
        target: agentStatus.userAgentId,
        set: values,
        setWhere: sql`${agentStatus.version} < excluded.version`,
      })
      .returning({
        // Qualified by hand: Drizzle leaves column names bare in RETURNING.
        same: sql<boolean>`exists (select 1 from "previous" p where
          (p.state, p.queued_count, p.live_conversation_id, p.live_thread_id, p.activity)
          is not distinct from (agent_status.state, agent_status.queued_count,
          agent_status.live_conversation_id, agent_status.live_thread_id, agent_status.activity))`,
      });
    const changed = applied.some((row) => !row.same);
    if (changed)
      effectsFor(tx).hint({ audience: realtimeKeys.user(identity.userId), domain: "agent-work" });
    return { applied: applied.length > 0, changed };
  });
}

/** Status rows of the owner's agents in the organization, with each agent's home desktop. */
export async function statusViews(
  db: DatabaseExecutor,
  identity: SessionIdentity,
  where?: SQL,
): Promise<AgentStatusView[]> {
  const visible = inArray(agentStatus.liveConversationId, visibleConversationIds(db, identity));
  const rows = await db
    .select({
      status: agentStatus,
      agent: { actorId: actors.entityId, name: userAgents.name },
      liveVisible: sql<boolean>`coalesce(${visible}, false)`,
      device: { id: desktopDevices.id, name: desktopDevices.name, online: deviceOnline },
    })
    .from(agentStatus)
    .innerJoin(
      userAgents,
      and(eq(userAgents.id, agentStatus.userAgentId), eq(userAgents.userId, identity.userId)),
    )
    .innerJoin(
      actors,
      and(
        eq(actors.userAgentId, userAgents.id),
        eq(actors.organizationId, agentStatus.organizationId),
      ),
    )
    .leftJoin(desktopDevices, eq(desktopDevices.id, userAgents.homeDeviceId))
    .where(
      and(
        eq(agentStatus.ownerUserId, identity.userId),
        eq(agentStatus.organizationId, identity.organizationId),
        where,
      ),
    )
    .orderBy(asc(userAgents.name), asc(agentStatus.userAgentId));
  return rows.map(toStatusView);
}

/** The owner's agents' published status. */
export function listStatus(db: DatabaseExecutor, identity: SessionIdentity) {
  return db.transaction(async (tx) => {
    await workspaceContext(tx, identity);
    return statusViews(tx, identity);
  });
}
