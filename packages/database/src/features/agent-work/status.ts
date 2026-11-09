import type { AgentStatusState, AgentStatusView } from "@startup-os/contracts/agent-work";

import type { DatabaseExecutor } from "../../client";
import { actors } from "../../core/actors/schema";
import { userAgents } from "../../core/actors/user-agents.schema";
import { deviceOnline } from "../../core/devices/repository";
import { desktopDevices } from "../../core/devices/schema";
import { workspaceContext } from "../context/access";
import { visibleConversations } from "../messaging/access";
import { messagingConversations, messagingMessages } from "../messaging/schema";
import {
  requireDevice,
  requireHomedAgent,
  type DeviceIdentity,
  type OwnerIdentity,
} from "./device";
import { agentStatus } from "./status.schema";
import { and, asc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";

export interface PublishStatusInput {
  userAgentId: string;
  state: AgentStatusState;
  queuedCount: number;
  liveConversationId?: string;
  liveThreadId?: string;
  activity?: string;
  version: number;
}

function visibleConversationIds(db: DatabaseExecutor, identity: OwnerIdentity) {
  return db
    .select({ id: messagingConversations.id })
    .from(messagingConversations)
    .where(visibleConversations(db, identity));
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
    const [live] = input.liveConversationId
      ? await tx
          .select({ id: messagingConversations.id })
          .from(messagingConversations)
          .where(
            and(
              eq(messagingConversations.id, input.liveConversationId),
              visibleConversations(tx, identity),
            ),
          )
      : [];
    const [thread] =
      live && input.liveThreadId
        ? await tx
            .select({ id: messagingMessages.id })
            .from(messagingMessages)
            .where(
              and(
                eq(messagingMessages.conversationId, live.id),
                eq(messagingMessages.id, input.liveThreadId),
                isNull(messagingMessages.threadId),
              ),
            )
        : [];
    const hidden = Boolean(input.liveConversationId) && !live;
    const values = {
      organizationId: identity.organizationId,
      ownerUserId: identity.userId,
      state: input.state,
      queuedCount: input.queuedCount,
      liveConversationId: live?.id ?? null,
      liveThreadId: thread?.id ?? null,
      activity: hidden ? null : (input.activity ?? null),
      version: input.version,
      updatedAt: sql`now()`,
    };
    const applied = await tx
      .insert(agentStatus)
      .values({ userAgentId: input.userAgentId, ...values })
      .onConflictDoUpdate({
        target: agentStatus.userAgentId,
        set: values,
        setWhere: sql`${agentStatus.version} < excluded.version`,
      })
      .returning({ id: agentStatus.userAgentId });
    return { applied: applied.length > 0 };
  });
}

/** Status rows of the owner's agents in the organization, with each agent's home desktop. */
export async function statusViews(
  db: DatabaseExecutor,
  identity: OwnerIdentity,
  where?: SQL,
): Promise<AgentStatusView[]> {
  const visible = inArray(agentStatus.liveConversationId, visibleConversationIds(db, identity));
  const rows = await db
    .select({
      status: agentStatus,
      agent: { actorId: actors.entityId, name: actors.name },
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
    .orderBy(asc(actors.name), asc(agentStatus.userAgentId));
  return rows.map(({ status, agent, liveVisible, device }) => ({
    userAgentId: status.userAgentId,
    agent,
    state: status.state,
    queuedCount: status.queuedCount,
    liveConversationId: liveVisible ? status.liveConversationId : null,
    liveThreadId: liveVisible ? status.liveThreadId : null,
    // Activity in a conversation the owner can no longer open may quote it.
    activity: status.liveConversationId === null || liveVisible ? status.activity : null,
    updatedAt: status.updatedAt.toISOString(),
    version: status.version,
    device: device?.id ? device : null,
  }));
}

/** The owner's agents' published status. */
export function listStatus(db: DatabaseExecutor, identity: OwnerIdentity) {
  return db.transaction(async (tx) => {
    await workspaceContext(tx, identity);
    return statusViews(tx, identity);
  });
}
