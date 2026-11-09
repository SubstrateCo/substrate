import type { DatabaseExecutor } from "../../client";
import { agentRunReplies, agentRuns } from "./schema";
import { and, eq } from "drizzle-orm";

/**
 * Links a message the agent just sent to the run it belongs to. Only one run per agent and thread
 * runs at a time, so a reply in that thread while it runs belongs to it. Messages outside the
 * run's thread stay unlinked.
 */
export async function recordRunReply(
  db: DatabaseExecutor,
  scope: { organizationId: string; userId: string; agentActorEntityId: string },
  message: { id: string; conversationId: string; threadId: string | null },
) {
  if (!message.threadId) return false;
  const [run] = await db
    .select({ id: agentRuns.id })
    .from(agentRuns)
    .where(
      and(
        eq(agentRuns.organizationId, scope.organizationId),
        eq(agentRuns.ownerUserId, scope.userId),
        eq(agentRuns.agentActorEntityId, scope.agentActorEntityId),
        eq(agentRuns.conversationId, message.conversationId),
        eq(agentRuns.threadId, message.threadId),
        eq(agentRuns.status, "running"),
      ),
    );
  if (!run) return false;
  const rows = await db
    .insert(agentRunReplies)
    .values({ runId: run.id, conversationId: message.conversationId, messageId: message.id })
    .onConflictDoNothing()
    .returning({ runId: agentRunReplies.runId });
  return rows.length > 0;
}
