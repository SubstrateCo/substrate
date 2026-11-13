import { contextEntityTypes } from "@substrate/contracts/context/input";
import type { McpInput, McpOutput } from "@substrate/contracts/harness/tools";

import { actors } from "../../core/actors/schema";
import { userAgents } from "../../core/actors/user-agents.schema";
import { user } from "../../core/authentication/schema";
import { entities } from "../../core/entities/schema";
import { entityLinks } from "../../core/links/schema";
import type { RepositoryContext } from "../../core/repository-context";
import type { SessionIdentity } from "../../core/session/identity";
import { AccessDeniedError } from "../../errors";
import { requireContextTarget } from "../context/access";
import { messageEntityReferences } from "../context/schema";
import { requireMessage, visibleConversations } from "../messaging/access";
import { messagingConversations, messagingMessages } from "../messaging/schema";
import { excerpt, iso, messageRef } from "./formatting";
import { pagination } from "./pagination";
import { actorSelection } from "./tasks";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";

type LinkKind = NonNullable<McpInput<"list_links">["kind"]>;
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
  if (input.source === "entities") {
    const target = await requireContextTarget(ctx, input.target.id);
    if (target.entityType !== input.target.type) throw new AccessDeniedError();
    const opposite = sql<string>`case when ${entityLinks.sourceEntityId} = ${input.target.id}
      then ${entityLinks.targetEntityId} else ${entityLinks.sourceEntityId} end`;
    const rows = await db
      .select({
        id: entities.entityId,
        sourceEntityId: entityLinks.sourceEntityId,
        relation: entityLinks.relationType,
        createdAt: entityLinks.createdAt,
      })
      .from(entityLinks)
      .innerJoin(
        entities,
        and(eq(entities.organizationId, scope.organizationId), eq(entities.entityId, opposite)),
      )
      .where(
        and(
          eq(entityLinks.organizationId, scope.organizationId),
          or(
            eq(entityLinks.sourceEntityId, input.target.id),
            eq(entityLinks.targetEntityId, input.target.id),
          ),
          inArray(entities.entityType, contextEntityTypes),
          ctx.readable(entities.entityId),
        ),
      )
      .orderBy(
        desc(entityLinks.createdAt),
        desc(entityLinks.sourceEntityId),
        desc(entityLinks.targetEntityId),
        desc(entityLinks.relationType),
      )
      .offset(p.offset)
      .limit(p.take);
    const items = await Promise.all(
      rows.map(async (row) => {
        const other = await requireContextTarget(ctx, row.id);
        let direction: "none" | "outgoing" | "incoming" = "none";
        if (row.relation !== "related_to")
          direction = row.sourceEntityId === input.target.id ? "outgoing" : "incoming";
        return {
          kind: "entity" as const,
          createdAt: iso(row.createdAt),
          entity: {
            type: other.entityType,
            id: row.id,
            title: other.title,
            relation: row.relation,
            direction,
          },
        };
      }),
    );
    return p.page(items);
  }
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
    const { conversation, message } = await requireMessage(db, identity, input.target.id);
    if (conversation.organizationId !== scope.organizationId) throw new AccessDeniedError();
    if (message.deletedAt) return p.page([]);
    const rows = await db
      .select({
        purpose: messageEntityReferences.purpose,
        createdAt: messageEntityReferences.createdAt,
        id: messageEntityReferences.entityId,
      })
      .from(messageEntityReferences)
      .where(
        and(
          ...references,
          eq(messageEntityReferences.messageId, input.target.id),
          ctx.readable(messageEntityReferences.entityId),
        ),
      )
      .orderBy(...order)
      .offset(p.offset)
      .limit(p.take);
    return p.page(
      await Promise.all(
        rows.map(async ({ purpose, createdAt, id }) => {
          const target = await requireContextTarget(ctx, id);
          return {
            kind: kinds[purpose],
            createdAt: iso(createdAt),
            work: { type: target.entityType, id, title: target.title },
          };
        }),
      ),
    );
  }
  const work = await requireContextTarget(ctx, input.target.id);
  if (work.entityType !== input.target.type) throw new AccessDeniedError();
  const rows = await db
    .select({
      purpose: messageEntityReferences.purpose,
      linkedAt: messageEntityReferences.createdAt,
      id: messagingMessages.id,
      conversationId: messagingMessages.conversationId,
      threadId: messagingMessages.threadId,
      author: actorSelection,
      body: sql<string>`case when ${messagingMessages.deletedAt} is not null then 'Message deleted' else ${messagingMessages.body} end`,
      createdAt: messagingMessages.createdAt,
    })
    .from(messageEntityReferences)
    .innerJoin(messagingMessages, eq(messagingMessages.id, messageEntityReferences.messageId))
    .innerJoin(
      messagingConversations,
      eq(messagingConversations.id, messageEntityReferences.conversationId),
    )
    .innerJoin(actors, eq(actors.entityId, messagingMessages.authorActorEntityId))
    .leftJoin(user, eq(user.id, actors.userId))
    .leftJoin(userAgents, eq(userAgents.id, actors.userAgentId))
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
