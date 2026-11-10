import type { AgentSourcesResult } from "@startup-os/contracts/agent-work";

import type { DatabaseExecutor } from "../../client";
import { actorAuthorKind, actorDisplayName } from "../../core/actors/display-name";
import { actors } from "../../core/actors/schema";
import { visibleConversations } from "../messaging/access";
import { conversationDisplayName } from "../messaging/display-name";
import { messagingConversations, messagingMessages } from "../messaging/schema";
import { requireDevice, type DeviceIdentity } from "./device";
import { and, eq, inArray } from "drizzle-orm";

/**
 * Message bodies for the home desktop, only while the owner can see their conversation now.
 * The same rule as the owner's own reads. Other IDs are returned as inaccessible, without detail.
 */
export function loadSources(db: DatabaseExecutor, identity: DeviceIdentity, messageIds: string[]) {
  return db.transaction(async (tx): Promise<AgentSourcesResult> => {
    await requireDevice(tx, identity);
    const ids = [...new Set(messageIds)];
    const rows = await tx
      .select({
        id: messagingMessages.id,
        conversationId: messagingMessages.conversationId,
        threadId: messagingMessages.threadId,
        conversationName: conversationDisplayName(tx, identity),
        conversationKind: messagingConversations.kind,
        actorId: actors.entityId,
        name: actorDisplayName(),
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
      .where(and(inArray(messagingMessages.id, ids), visibleConversations(tx, identity)));
    const found = new Set(rows.map((row) => row.id));
    return {
      messages: rows
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id))
        .map(({ actorId, name, kind, createdAt, ...row }) => ({
          ...row,
          author: { actorId, name, kind },
          createdAt: createdAt.toISOString(),
        })),
      inaccessible: ids.filter((id) => !found.has(id)),
    };
  });
}
