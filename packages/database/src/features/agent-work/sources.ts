import type { AgentSourcesResult } from "@substrate/contracts/agent-work";

import type { DatabaseExecutor } from "../../client";
import { actorAuthorKind } from "../../core/actors/display-name";
import { actors } from "../../core/actors/schema";
import { userAgents } from "../../core/actors/user-agents.schema";
import { user } from "../../core/authentication/schema";
import {
  requireDevice,
  type DeviceIdentity,
  type ResolvedDeviceIdentity,
} from "../../core/session/device";
import { visibleConversations } from "../messaging/access";
import { conversationDisplayName } from "../messaging/display-name";
import { messagingConversations, messagingMessages } from "../messaging/schema";
import { revokedInvocations } from "./invocations";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";

/**
 * Message bodies for the home desktop, only while the owner can see their conversation now.
 * The same rule as the owner's own reads. Other IDs are returned as inaccessible, without detail.
 * Named calls are checked again first: the message of a call that may not run any more is
 * inaccessible, and the call drops.
 */
export async function loadSourcesForDevice(
  tx: DatabaseExecutor,
  identity: ResolvedDeviceIdentity,
  messageIds: string[],
  invocationIds: string[] = [],
): Promise<AgentSourcesResult> {
  const calls = await revokedInvocations(tx, identity, invocationIds);
  const ids = [...new Set([...messageIds, ...calls.allowed])];
  const readable = ids.filter((id) => !calls.blocked.has(id));
  const rows = readable.length
    ? await tx
        .select({
          id: messagingMessages.id,
          conversationId: messagingMessages.conversationId,
          threadId: messagingMessages.threadId,
          conversationName: conversationDisplayName(tx, identity),
          conversationKind: messagingConversations.kind,
          actorId: actors.entityId,
          name: sql<string>`case when ${actors.type} = 'agent' then coalesce(${userAgents.name}, 'Agent') else ${user.name} end`,
          kind: actorAuthorKind(identity.userId),
          body: messagingMessages.body,
          createdAt: messagingMessages.createdAt,
        })
        .from(messagingMessages)
        .innerJoin(
          messagingConversations,
          eq(messagingConversations.id, messagingMessages.conversationId),
        )
        .innerJoin(actors, eq(actors.entityId, messagingMessages.authorActorEntityId))
        .leftJoin(user, eq(user.id, actors.userId))
        .leftJoin(userAgents, eq(userAgents.id, actors.userAgentId))
        .where(
          and(
            inArray(messagingMessages.id, readable),
            isNull(messagingMessages.deletedAt),
            visibleConversations(tx, identity),
          ),
        )
    : [];
  const found = new Set(rows.map((row) => row.id));
  const result: AgentSourcesResult = {
    messages: rows
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id))
      .map(({ actorId, name, kind, createdAt, ...row }) => ({
        ...row,
        author: { actorId, name, kind },
        createdAt: createdAt.toISOString(),
      })),
    inaccessible: ids.filter((id) => !found.has(id)),
  };
  if (invocationIds.length) result.inaccessibleInvocations = calls.revoked;
  return result;
}

export function loadSources(
  db: DatabaseExecutor,
  identity: DeviceIdentity,
  messageIds: string[],
  invocationIds: string[] = [],
) {
  return db.transaction(async (tx) => {
    const device = await requireDevice(tx, identity);
    return loadSourcesForDevice(
      tx,
      { ...identity, deviceId: device.id },
      messageIds,
      invocationIds,
    );
  });
}
