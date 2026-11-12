import type { RepositoryContext } from "../../core/repository-context";
import type { SessionIdentity } from "../../core/session/identity";
import { queryCallers } from "../agents/callers";
import { queryCallsLog } from "./audit";
import { invocationViews, queryMyCalls } from "./invocations";
import { agentInvocations } from "./invocations.schema";
import { queryConversationRequests, queryNeedsYou } from "./request-views";
import { statusViews } from "./status";
import { eq } from "drizzle-orm";

export function createAgentWorkReadRepository(
  context: RepositoryContext,
  identity: SessionIdentity,
) {
  const { db } = context;
  return {
    listConversationRequests: (conversationId: string) =>
      queryConversationRequests(db, identity, conversationId),
    listNeedsYou: () => context.transaction((ctx) => queryNeedsYou(ctx.db, identity)),
    listStatus: () => statusViews(db, identity),
    listInvocations: (userAgentId?: string) =>
      invocationViews(
        db,
        identity,
        userAgentId ? eq(agentInvocations.userAgentId, userAgentId) : undefined,
      ),
    listMyCalls: (conversationId: string) => queryMyCalls(db, identity, conversationId),
    listCallsLog: (userAgentId: string) => queryCallsLog(db, identity, userAgentId),
    listCallers: (userAgentId: string) => queryCallers(db, identity, userAgentId),
  };
}
