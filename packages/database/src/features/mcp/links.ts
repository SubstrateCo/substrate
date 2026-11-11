import type { McpInput, McpOutput } from "@substrate/contracts/harness/tools";

import { actors } from "../../core/actors/schema";
import type { RepositoryContext } from "../../core/repository-context";
import type { SessionIdentity } from "../../core/session/identity";
import { AccessDeniedError } from "../../errors";
import { requireWork } from "../context/access";
import { messageEntityReferences } from "../context/schema";
import { requireMessage, visibleConversations } from "../messaging/access";
import { messagingConversations, messagingMessages } from "../messaging/schema";
import { projects } from "../projects/schema";
import { liveTask } from "../tasks/access";
import { tasks } from "../tasks/tasks.schema";
import { excerpt, iso, messageRef } from "./formatting";
import { pagination } from "./pagination";
import { actorSelection } from "./tasks";
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";

type LinkKind = McpOutput<"list_links">["items"][number]["kind"];
type Purpose = (typeof messageEntityReferences.$inferSelect)["purpose"];
// Agents see link kinds named for what happened, not the stored reference purpose.
const kinds: Record<Purpose, LinkKind> = {
  source: "origin",
  mention: "mention",
  association: "attachment",
};
const purposes: Record<LinkKind, Purpose> = {
  origin: "source",
  mention: "mention",
  attachment: "association",
};

export async function listLinks(
  ctx: RepositoryContext,
  identity: SessionIdentity,
  input: McpInput<"list_links">,
): Promise<McpOutput<"list_links">> {
  const { db, scope } = ctx;
  const p = pagination(scope, "list_links", input);
  const references = [
    eq(messageEntityReferences.organizationId, scope.organizationId),
    input.kind ? eq(messageEntityReferences.purpose, purposes[input.kind]) : undefined,
  ];
  const order = [
    desc(messageEntityReferences.createdAt),
    desc(messageEntityReferences.messageId),
    desc(messageEntityReferences.entityId),
  ];
  if (input.target.type === "message") {
    const { conversation } = await requireMessage(db, identity, input.target.id);
    if (conversation.organizationId !== scope.organizationId) throw new AccessDeniedError();
    // A task is shown when the caller can read its project and the task is not deleted.
    const rows = await db
      .select({
        purpose: messageEntityReferences.purpose,
        createdAt: messageEntityReferences.createdAt,
        type: sql<"task" | "project">`${messageEntityReferences.entityType}`,
        id: messageEntityReferences.entityId,
        title: sql<string>`coalesce(${tasks.title}, ${projects.name})`,
      })
      .from(messageEntityReferences)
      .leftJoin(tasks, eq(tasks.entityId, messageEntityReferences.entityId))
      .leftJoin(projects, eq(projects.entityId, messageEntityReferences.entityId))
      .where(
        and(
          ...references,
          eq(messageEntityReferences.messageId, input.target.id),
          ctx.readable(sql`coalesce(${tasks.projectEntityId}, ${projects.entityId})`),
          or(isNull(tasks.entityId), liveTask()),
        ),
      )
      .orderBy(...order)
      .offset(p.offset)
      .limit(p.take);
    return p.page(
      rows.map(({ purpose, createdAt, ...work }) => ({
        kind: kinds[purpose],
        createdAt: iso(createdAt),
        work,
      })),
    );
  }
  const work = await requireWork(ctx, input.target.id);
  if (work.entityType !== input.target.type) throw new AccessDeniedError();
  const rows = await db
    .select({
      purpose: messageEntityReferences.purpose,
      linkedAt: messageEntityReferences.createdAt,
      id: messagingMessages.id,
      conversationId: messagingMessages.conversationId,
      threadId: messagingMessages.threadId,
      author: actorSelection,
      body: messagingMessages.body,
      createdAt: messagingMessages.createdAt,
    })
    .from(messageEntityReferences)
    .innerJoin(messagingMessages, eq(messagingMessages.id, messageEntityReferences.messageId))
    .innerJoin(
      messagingConversations,
      eq(messagingConversations.id, messageEntityReferences.conversationId),
    )
    .innerJoin(actors, eq(actors.entityId, messagingMessages.authorActorEntityId))
    .where(
      and(
        ...references,
        eq(messageEntityReferences.entityId, input.target.id),
        visibleConversations(db, identity),
      ),
    )
    .orderBy(...order)
    .offset(p.offset)
    .limit(p.take);
  return p.page(
    rows.map((row) => ({
      kind: kinds[row.purpose],
      createdAt: iso(row.linkedAt),
      message: {
        ...messageRef(row),
        author: row.author,
        ...excerpt(row.body, 300),
        createdAt: iso(row.createdAt),
      },
    })),
  );
}
