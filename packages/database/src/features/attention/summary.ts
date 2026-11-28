import { needsYouItems } from "@substrate/contracts/agent-work/needs-you";
import type { AttentionSummary } from "@substrate/contracts/attention";

import type { DatabaseExecutor } from "../../core/executor";
import { member } from "../../core/organizations/schema";
import { workspaceContext } from "../../core/session/workspace";
import { AccessDeniedError } from "../../errors";
import { queryNeedsYou } from "../agent-work/needs-you";
import { createMessagingRepository } from "../messaging/service";
import { createFeedRepository } from "../notifications/service";
import { eq } from "drizzle-orm";

export async function accountAttention(
  db: DatabaseExecutor,
  userId: string,
): Promise<AttentionSummary> {
  const memberships = await db
    .select({ organizationId: member.organizationId })
    .from(member)
    .where(eq(member.userId, userId));
  const keys = new Set<string>();
  for (const { organizationId } of memberships) {
    const identity = { userId, organizationId };
    const resolved = await workspaceContext(db, identity).catch((error: Error) => {
      if (error instanceof AccessDeniedError) return null;
      throw error;
    });
    if (!resolved) continue;
    const [messages, notifications, needsYou] = await Promise.all([
      createMessagingRepository(db, identity, resolved).unreadMessageIds(),
      createFeedRepository(resolved.context, identity).attentionKeys(),
      queryNeedsYou(db, identity),
    ]);
    for (const id of messages) keys.add(`message:${id}`);
    for (const key of notifications) keys.add(key);
    const items = needsYouItems(needsYou);
    for (const request of items.requests) keys.add(`request:${request.id}`);
    for (const turn of items.turns) keys.add(`turn:${turn.id}`);
    for (const item of items.items) keys.add(`item:${item.id}`);
    for (const agent of items.agents) keys.add(`agent:${agent.userAgentId}`);
  }
  return { count: keys.size };
}
