import type { AgentNeedsYou, AgentRequestView } from "@substrate/contracts/agent-work";

import type { DatabaseExecutor } from "../../client";
import { actorDisplayName } from "../../core/actors/display-name";
import { actors } from "../../core/actors/schema";
import type { SessionIdentity } from "../../core/session/identity";
import { workspaceContext } from "../../core/session/workspace";
import { visibleConversations } from "../messaging/access";
import { conversationDisplayName } from "../messaging/display-name";
import { messagingConversations } from "../messaging/schema";
import { agentRequests } from "./requests.schema";
import { statusViews } from "./status";
import { agentStatus } from "./status.schema";
import { toRequestView } from "./views";
import { and, desc, eq, gt, inArray, or, sql, type SQL } from "drizzle-orm";

/** Requests of the owner's own agents in the organization. */
export function ownedRequests(identity: SessionIdentity) {
  return and(
    eq(agentRequests.ownerUserId, identity.userId),
    eq(agentRequests.organizationId, identity.organizationId),
  );
}

// The place is shown only while the owner can open the conversation. A request in a hidden
// place is a placeholder: no IDs, names, text, response or proposal. A proposal whose target
// conversation the owner cannot open is not shown either.
async function requestViews(
  db: DatabaseExecutor,
  identity: SessionIdentity,
  where: SQL | undefined,
): Promise<AgentRequestView[]> {
  const visibleIds = db
    .select({ id: sql`${messagingConversations.id}::text` })
    .from(messagingConversations)
    .where(visibleConversations(db, identity));
  const target = sql`${agentRequests.proposedAction}->'input'->>'conversationId'`;
  const rows = await db
    .select({
      request: agentRequests,
      agent: { actorId: actors.entityId, name: actorDisplayName() },
      conversationName: sql<
        string | null
      >`case when ${messagingConversations.id} is null then null else ${conversationDisplayName(db, identity)} end`,
      targetVisible: sql<boolean>`(${target} IS NULL OR ${inArray(target, visibleIds)})`,
    })
    .from(agentRequests)
    .innerJoin(
      actors,
      and(
        eq(actors.entityId, agentRequests.agentActorEntityId),
        eq(actors.organizationId, agentRequests.organizationId),
      ),
    )
    .leftJoin(
      messagingConversations,
      and(
        eq(messagingConversations.id, agentRequests.conversationId),
        visibleConversations(db, identity),
      ),
    )
    .where(and(ownedRequests(identity), where))
    .orderBy(desc(agentRequests.createdAt), desc(agentRequests.id))
    .limit(100);
  return rows.map(toRequestView);
}

// Blocking requests stop being answerable when their wait ends.
export const answerableRequest = and(
  eq(agentRequests.status, "pending"),
  or(sql`${agentRequests.expiresAt} IS NULL`, gt(agentRequests.expiresAt, sql`now()`)),
);

/**
 * The owner's requests in one conversation they can see: open ones and those decided in the last
 * day, so cards can show the result, and executed proposals that posted here, so the created
 * message links back. Nothing for a conversation the owner cannot open.
 */
export function listConversationRequests(
  db: DatabaseExecutor,
  identity: SessionIdentity,
  conversationId: string,
) {
  return db.transaction(async (tx) => {
    await workspaceContext(tx, identity);
    const [visible] = await tx
      .select({ id: messagingConversations.id })
      .from(messagingConversations)
      .where(
        and(eq(messagingConversations.id, conversationId), visibleConversations(tx, identity)),
      );
    if (!visible) return [];
    // The origin place of a backlinked proposal is shown only if the owner can still see it.
    return requestViews(
      tx,
      identity,
      or(
        and(
          eq(agentRequests.conversationId, conversationId),
          or(answerableRequest, gt(agentRequests.createdAt, sql`now() - interval '1 day'`)),
        ),
        and(
          eq(agentRequests.status, "executed"),
          sql`${agentRequests.outcome}->'receipt'->>'kind' = 'message'`,
          sql`${agentRequests.outcome}->'receipt'->>'conversationId' = ${conversationId}`,
        ),
      ),
    );
  });
}

/** Everything that waits for the owner: open requests and agents that report needs_you. */
export function listNeedsYou(db: DatabaseExecutor, identity: SessionIdentity) {
  return db.transaction(async (tx): Promise<AgentNeedsYou> => {
    await workspaceContext(tx, identity);
    return {
      requests: await requestViews(tx, identity, answerableRequest),
      agents: await statusViews(tx, identity, eq(agentStatus.state, "needs_you")),
    };
  });
}
