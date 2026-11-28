import { requestMachine, type AgentRequestView } from "@substrate/contracts/agent-work";

import { actors } from "../../../core/actors/schema";
import { userAgents } from "../../../core/actors/user-agents.schema";
import type { DatabaseExecutor } from "../../../core/executor";
import type { SessionIdentity } from "../../../core/session/identity";
import { visibleConversations } from "../../messaging/access";
import { conversationDisplayName } from "../../messaging/display-name";
import { messagingConversations } from "../../messaging/schema";
import { inStates } from "../machine-sql";
import { toRequestView } from "../views";
import { agentRequests } from "./requests.schema";
import { and, desc, eq, exists, gt, inArray, or, sql, type SQL } from "drizzle-orm";

export function ownedRequests(identity: SessionIdentity) {
  return and(
    eq(agentRequests.ownerUserId, identity.userId),
    eq(agentRequests.organizationId, identity.organizationId),
  );
}

export async function requestViews(
  db: DatabaseExecutor,
  identity: SessionIdentity,
  where: SQL | undefined,
): Promise<AgentRequestView[]> {
  const visibleIds = db
    .select({ id: sql`${messagingConversations.id}::text` })
    .from(messagingConversations)
    .where(visibleConversations(db, identity));
  const targets = sql`jsonb_object_keys(coalesce(${agentRequests.targetBasis}->'conversations', '{}'::jsonb))`;
  const rows = await db
    .select({
      request: agentRequests,
      agent: { actorId: actors.entityId, name: userAgents.name },
      conversationName: sql<
        string | null
      >`case when ${messagingConversations.id} is null then null else ${conversationDisplayName(db, identity)} end`,
      targetVisible: sql<boolean>`NOT EXISTS (SELECT 1 FROM ${targets} AS target(id) WHERE NOT ${inArray(sql`target.id`, visibleIds)})`,
    })
    .from(agentRequests)
    .innerJoin(
      actors,
      and(
        eq(actors.entityId, agentRequests.agentActorEntityId),
        eq(actors.organizationId, agentRequests.organizationId),
      ),
    )
    .innerJoin(userAgents, eq(userAgents.id, actors.userAgentId))
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

export const answerableBy = (event: "answer" | "decline" | "approve") =>
  and(
    inStates(agentRequests.status, requestMachine.from(event)),
    or(sql`${agentRequests.expiresAt} IS NULL`, gt(agentRequests.expiresAt, sql`now()`)),
  );
const answerableRequest = answerableBy("answer");

export function queryConversationRequests(
  db: DatabaseExecutor,
  identity: SessionIdentity,
  conversationId: string,
) {
  const visible = exists(
    db
      .select({ id: messagingConversations.id })
      .from(messagingConversations)
      .where(
        and(eq(messagingConversations.id, conversationId), visibleConversations(db, identity)),
      ),
  );
  return requestViews(
    db,
    identity,
    and(
      visible,
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
    ),
  );
}
