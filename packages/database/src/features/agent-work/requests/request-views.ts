import {
  requestMachine,
  type AgentNeedsYou,
  type AgentRequestView,
} from "@substrate/contracts/agent-work";

import { actors } from "../../../core/actors/schema";
import { userAgents } from "../../../core/actors/user-agents.schema";
import type { DatabaseExecutor } from "../../../core/executor";
import type { SessionIdentity } from "../../../core/session/identity";
import { visibleConversations } from "../../messaging/access";
import { conversationDisplayName } from "../../messaging/display-name";
import { messagingConversations } from "../../messaging/schema";
import { awaitingOwner, desktopUpdateViews, invocationViews } from "../calls/invocations";
import { inStates } from "../machine-sql";
import { statusViews } from "../status";
import { agentStatus } from "../status.schema";
import { toRequestView } from "../views";
import { agentRequests } from "./requests.schema";
import { and, desc, eq, exists, gt, inArray, or, sql, type SQL } from "drizzle-orm";

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
  // The conversations a proposal names are the keys of its target basis.
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

// The owner can still decide the request with this event. Blocking requests stop being
// answerable when their wait ends.
export const answerableBy = (event: "answer" | "decline" | "approve") =>
  and(
    inStates(agentRequests.status, requestMachine.from(event)),
    or(sql`${agentRequests.expiresAt} IS NULL`, gt(agentRequests.expiresAt, sql`now()`)),
  );
const answerableRequest = answerableBy("answer");

/**
 * The owner's requests in one conversation they can see: open ones and those decided in the last
 * day, so cards can show the result, and executed proposals that posted here, so the created
 * message links back. Nothing for a conversation the owner cannot open.
 */
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
  // The origin place of a backlinked proposal is shown only if the owner can still see it.
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

/**
 * Everything that waits for the owner: open requests, agents that report needs_you, calls that
 * wait for approval, and agents whose desktop needs an update to run caller calls.
 */
export async function queryNeedsYou(
  db: DatabaseExecutor,
  identity: SessionIdentity,
): Promise<AgentNeedsYou> {
  return {
    requests: await requestViews(db, identity, answerableRequest),
    agents: await statusViews(db, identity, eq(agentStatus.state, "needs_you")),
    calls: await invocationViews(db, identity, awaitingOwner),
    desktopUpdateRequired: await desktopUpdateViews(db, identity),
  };
}
