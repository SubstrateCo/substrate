import { and, asc, eq, gt, inArray, isNull, sql, type SQLWrapper } from "drizzle-orm";
import type { DatabaseExecutor } from "../../client";
import { actors } from "../../core/actors/schema";
import { entities } from "../../core/entities/schema";
import { member } from "../../core/organizations/schema";
import { user } from "../../core/authentication/schema";
import { pageSize } from "../../core/repository-context";
import { ValidationError } from "../../errors";
import { messagingConversations, messagingMessages } from "../messaging/schema";
import { visibleConversations, type MessagingIdentity } from "../messaging/access";
import { projects } from "../projects/schema";
import { tasks } from "../tasks/tasks.schema";
import { workspaceContext, requireWork } from "./access";

export type SearchKind = "all" | "task" | "project" | "message" | "conversation" | "person";
export interface SearchResult {
  id: string;
  kind: Exclude<SearchKind, "all">;
  title: string;
  projectEntityId?: string;
  conversationId?: string;
  threadId?: string | null;
}
export async function contextSearch(
  db: DatabaseExecutor,
  scope: MessagingIdentity,
  input: {
    query: string;
    kind?: SearchKind;
    after?: string;
    limit?: number;
    conversationId?: string;
    editable?: boolean;
  },
) {
  const ctx = await workspaceContext(db, scope);
  const limit = pageSize(input.limit ?? 30);
  if (
    input.query.length > 200 ||
    !["all", "task", "project", "message", "conversation", "person"].includes(input.kind ?? "all")
  )
    throw new ValidationError("Invalid search.");
  const query = input.query.trim();
  const kind = input.kind ?? "all";
  const match = (column: SQLWrapper) =>
    sql`(to_tsvector('simple', ${column}) @@ plainto_tsquery('simple', ${query}) OR strpos(lower(coalesce(${column}, '')), lower(${query})) > 0)`;
  const results: SearchResult[] = [];
  if (kind === "all" || kind === "task" || kind === "project") {
    for (const type of ["task", "project"] as const) {
      if (kind !== "all" && kind !== type) continue;
      const table = type === "task" ? tasks : projects;
      const column = type === "task" ? tasks.title : projects.name;
      const rows = await db
        .select({ id: table.entityId, title: column })
        .from(table)
        .where(
          and(
            eq(table.organizationId, scope.organizationId),
            inArray(table.entityId, ctx.readableEntities()),
            query ? match(sql`${column} || ' ' || ${table.description}`) : undefined,
            input.after ? gt(table.entityId, input.after) : undefined,
          ),
        )
        .orderBy(asc(table.entityId))
        .limit(limit);
      for (const row of rows) {
        try {
          const work = await requireWork(ctx, row.id, input.editable ? "edit" : "view");
          results.push({ ...row, kind: type, projectEntityId: work.projectEntityId });
        } catch (error) {
          if (error instanceof Error && error.name === "AccessDeniedError") continue;
          throw error;
        }
      }
    }
  }
  if (kind === "all" || kind === "conversation") {
    const rows = await db
      .select({
        id: messagingConversations.id,
        title: sql<string>`coalesce(${messagingConversations.name}, 'Direct conversation')`,
      })
      .from(messagingConversations)
      .where(
        and(
          visibleConversations(db, scope),
          query ? match(messagingConversations.name) : undefined,
          input.after ? gt(messagingConversations.id, input.after) : undefined,
        ),
      )
      .orderBy(asc(messagingConversations.id))
      .limit(limit);
    results.push(
      ...rows.map((row) => ({ ...row, kind: "conversation" as const, conversationId: row.id })),
    );
  }
  if (kind === "all" || kind === "message") {
    const rows = await db
      .select({
        id: messagingMessages.id,
        title: messagingMessages.body,
        conversationId: messagingMessages.conversationId,
        threadId: messagingMessages.threadId,
      })
      .from(messagingMessages)
      .innerJoin(
        messagingConversations,
        eq(messagingConversations.id, messagingMessages.conversationId),
      )
      .where(
        and(
          visibleConversations(db, scope),
          query ? match(messagingMessages.body) : undefined,
          input.after ? gt(messagingMessages.id, input.after) : undefined,
        ),
      )
      .orderBy(asc(messagingMessages.id))
      .limit(limit);
    results.push(
      ...rows.map((row) => ({ ...row, title: row.title.slice(0, 160), kind: "message" as const })),
    );
  }
  if (kind === "person" && input.conversationId) {
    const rows = await db
      .select({ id: actors.entityId, title: actors.name })
      .from(actors)
      .innerJoin(user, eq(user.id, actors.userId))
      .innerJoin(entities, eq(entities.entityId, actors.entityId))
      .innerJoin(
        member,
        and(eq(member.userId, user.id), eq(member.organizationId, actors.organizationId)),
      )
      .where(
        and(
          eq(actors.organizationId, scope.organizationId),
          isNull(actors.disabledAt),
          isNull(entities.deletedAt),
          eq(user.emailVerified, true),
          query ? match(actors.name) : undefined,
          input.after ? gt(actors.entityId, input.after) : undefined,
        ),
      )
      .orderBy(asc(actors.entityId))
      .limit(limit);
    for (const row of rows) {
      const [actor] = await db.select().from(actors).where(eq(actors.entityId, row.id));
      if (!actor?.userId) continue;
      const [conversation] = await db
        .select({ id: messagingConversations.id })
        .from(messagingConversations)
        .where(
          and(
            eq(messagingConversations.id, input.conversationId),
            visibleConversations(db, scope),
            visibleConversations(db, {
              userId: actor.userId,
              organizationId: scope.organizationId,
            }),
          ),
        );
      if (conversation) results.push({ ...row, kind: "person" });
    }
  }
  return results.sort((a, b) => a.id.localeCompare(b.id)).slice(0, limit);
}
