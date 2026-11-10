import type {
  AgentNeedsYou,
  AgentRequestPlace,
  AgentRequestView,
} from "@startup-os/contracts/agent-work";

import type { DatabaseExecutor } from "../../client";
import { actorDisplayName } from "../../core/actors/display-name";
import { actors } from "../../core/actors/schema";
import { workspaceContext } from "../context/access";
import { visibleConversations } from "../messaging/access";
import { conversationDisplayName } from "../messaging/display-name";
import { messagingConversations } from "../messaging/schema";
import type { OwnerIdentity } from "./device";
import { agentRequests } from "./requests.schema";
import { statusViews } from "./status";
import { agentStatus } from "./status.schema";
import { and, desc, eq, gt, inArray, or, sql, type SQL } from "drizzle-orm";

const iso = (value: Date | null) => value?.toISOString() ?? null;

/** Requests of the owner's own agents in the organization. */
export function ownedRequests(identity: OwnerIdentity) {
  return and(
    eq(agentRequests.ownerUserId, identity.userId),
    eq(agentRequests.organizationId, identity.organizationId),
  );
}

// The place is shown only while the owner can open the conversation. A request in a hidden
// place is a placeholder: no IDs, names, text, response or proposal. A proposal whose target
// conversation the owner cannot open is not shown either.
export async function requestViews(
  db: DatabaseExecutor,
  identity: OwnerIdentity,
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
  return rows.map(({ request, agent, conversationName: name, targetVisible }): AgentRequestView => {
    const common = {
      id: request.id,
      userAgentId: request.userAgentId,
      agent,
      turnId: request.turnId,
      kind: request.kind,
      mode: request.mode,
      status: request.status,
      createdAt: request.createdAt.toISOString(),
      resolvedAt: iso(request.resolvedAt),
      expiresAt: iso(request.expiresAt),
    };
    if (request.conversationId && name === null)
      return {
        ...common,
        sessionKey: null,
        place: { access: "hidden" },
        payload: null,
        response: null,
        proposal: null,
      };
    let place: AgentRequestPlace = { access: "none" };
    if (request.conversationId && name !== null)
      place = {
        access: "visible",
        conversationId: request.conversationId,
        threadId: request.threadId,
        conversationName: name,
        anchorMessageId: request.anchorMessageId,
      };
    return {
      ...common,
      sessionKey: request.sessionKey,
      place,
      payload: request.payload,
      response: request.response,
      proposal:
        request.proposedAction && request.actionHash && targetVisible
          ? {
              action: request.proposedAction,
              actionHash: request.actionHash,
              outcome: request.outcome,
            }
          : null,
    };
  });
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
  identity: OwnerIdentity,
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
export function listNeedsYou(db: DatabaseExecutor, identity: OwnerIdentity) {
  return db.transaction(async (tx): Promise<AgentNeedsYou> => {
    await workspaceContext(tx, identity);
    return {
      requests: await requestViews(tx, identity, answerableRequest),
      agents: await statusViews(tx, identity, eq(agentStatus.state, "needs_you")),
    };
  });
}
