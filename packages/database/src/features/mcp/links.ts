import {
  linkPreview,
  type linkKinds,
  type McpInput,
  type McpOutput,
} from "@substrate/contracts/agent-tools/tools";
import { contextEntityTypes, type ContextEntityType } from "@substrate/contracts/context/input";

import { joinActorAccount } from "../../core/actors/joined-profile";
import { entities } from "../../core/entities/schema";
import { entityLinks } from "../../core/links/schema";
import type { RepositoryContext } from "../../core/repository-context";
import type { SessionIdentity } from "../../core/session/identity";
import { AccessDeniedError } from "../../errors";
import { requireContextTarget } from "../context/access";
import { messageEntityReferences } from "../context/schema";
import { joinReferenceMessages } from "../context/service";
import { contextTargetsOf } from "../context/target-page";
import { visibleConversationIds, visibleConversations } from "../messaging/access";
import { messagingMessages } from "../messaging/schema";
import { actorSelection } from "./authors";
import { excerpt, iso, messageRef } from "./formatting";
import { pagination } from "./pagination";
import { and, asc, count, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";

type LinkKind = (typeof linkKinds)[number];
type Purpose = (typeof messageEntityReferences.$inferSelect)["purpose"];
type RecordLinks = McpOutput<"get_project">["linked"];
type MessageRecord = McpOutput<"read_thread">["root"]["records"][number];
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

/** The readable records each live message references, oldest reference first. */
export async function recordsOfMessages(
  ctx: RepositoryContext,
  messageIds: string[],
): Promise<Map<string, MessageRecord[]>> {
  const result = new Map<string, MessageRecord[]>();
  if (!messageIds.length) return result;
  const rows = await ctx.db
    .select({
      messageId: messageEntityReferences.messageId,
      id: messageEntityReferences.entityId,
      purpose: messageEntityReferences.purpose,
    })
    .from(messageEntityReferences)
    .innerJoin(messagingMessages, eq(messagingMessages.id, messageEntityReferences.messageId))
    .where(
      and(
        eq(messageEntityReferences.organizationId, ctx.scope.organizationId),
        inArray(messageEntityReferences.messageId, messageIds),
        inArray(messageEntityReferences.entityType, contextEntityTypes),
        isNull(messagingMessages.deletedAt),
        ctx.readable(messageEntityReferences.entityId),
      ),
    )
    .orderBy(asc(messageEntityReferences.createdAt), asc(messageEntityReferences.entityId));
  const targets = await contextTargetsOf(
    ctx,
    rows.map((row) => row.id),
  );
  for (const row of rows) {
    const target = targets.get(row.id);
    if (!target) continue;
    const records = result.get(row.messageId) ?? [];
    records.push({
      type: target.entityType,
      id: row.id,
      title: target.title,
      kind: kinds[row.purpose],
    });
    result.set(row.messageId, records);
  }
  return result;
}

function messageLinks(
  ctx: RepositoryContext,
  identity: SessionIdentity,
  entityId: string,
  kind?: LinkKind,
) {
  const { db, scope } = ctx;
  const references = and(
    eq(messageEntityReferences.organizationId, scope.organizationId),
    eq(messageEntityReferences.entityId, entityId),
    kind ? eq(messageEntityReferences.purpose, purposes[kind]) : undefined,
  );
  return {
    async rows(offset: number, limit: number) {
      const messages = db
        .select({
          purpose: messageEntityReferences.purpose,
          id: messagingMessages.id,
          conversationId: messagingMessages.conversationId,
          threadId: messagingMessages.threadId,
          author: actorSelection,
          body: sql<string>`case when ${messagingMessages.deletedAt} is not null then 'Message deleted' else ${messagingMessages.body} end`,
          createdAt: messagingMessages.createdAt,
        })
        .from(messageEntityReferences)
        .$dynamic();
      const rows = await joinActorAccount(joinReferenceMessages(messages))
        .where(and(references, visibleConversations(db, identity)))
        .orderBy(
          desc(messageEntityReferences.createdAt),
          desc(messageEntityReferences.messageId),
          desc(messageEntityReferences.purpose),
        )
        .offset(offset)
        .limit(limit);
      return rows.map((row) => ({
        ...messageRef(row),
        author: row.author,
        ...excerpt(row.body, 300),
        createdAt: iso(row.createdAt),
        kind: kinds[row.purpose],
      }));
    },
    async count() {
      const [row] = await db
        .select({ total: count() })
        .from(messageEntityReferences)
        .where(
          and(
            references,
            inArray(messageEntityReferences.conversationId, visibleConversationIds(db, identity)),
          ),
        );
      return row?.total ?? 0;
    },
  };
}

/** Entity links of a record whose other end the reader can open, newest first. */
function recordLinks(
  ctx: RepositoryContext,
  entityId: string,
  types: readonly ContextEntityType[],
) {
  const { db, scope } = ctx;
  const opposite = sql<string>`case when ${entityLinks.sourceEntityId} = ${entityId}
    then ${entityLinks.targetEntityId} else ${entityLinks.sourceEntityId} end`;
  const from = () =>
    db
      .select({
        id: entities.entityId,
        sourceEntityId: entityLinks.sourceEntityId,
        relation: entityLinks.relationType,
      })
      .from(entityLinks)
      .innerJoin(
        entities,
        and(eq(entities.organizationId, scope.organizationId), eq(entities.entityId, opposite)),
      );
  const where = and(
    eq(entityLinks.organizationId, scope.organizationId),
    or(eq(entityLinks.sourceEntityId, entityId), eq(entityLinks.targetEntityId, entityId)),
    inArray(entities.entityType, types),
    ctx.readable(entities.entityId),
  );
  return {
    async rows(limit: number) {
      const rows = await from()
        .where(where)
        .orderBy(
          desc(entityLinks.createdAt),
          desc(entityLinks.sourceEntityId),
          desc(entityLinks.targetEntityId),
          desc(entityLinks.relationType),
        )
        .limit(limit);
      const targets = await contextTargetsOf(
        ctx,
        rows.map((row) => row.id),
      );
      return rows.flatMap((row) => {
        const other = targets.get(row.id);
        if (!other) return [];
        let direction: "none" | "outgoing" | "incoming" = "none";
        if (row.relation !== "related_to")
          direction = row.sourceEntityId === entityId ? "outgoing" : "incoming";
        return [
          {
            type: other.entityType,
            id: row.id,
            title: other.title,
            relation: row.relation,
            direction,
          },
        ];
      });
    },
    async count() {
      const [row] = await db
        .select({ total: count() })
        .from(entityLinks)
        .innerJoin(
          entities,
          and(eq(entities.organizationId, scope.organizationId), eq(entities.entityId, opposite)),
        )
        .where(where);
      return row?.total ?? 0;
    },
  };
}

/**
 * The newest links of a record that a record read shows. Call it only after the read has checked
 * access to the record. `exclude` leaves out record types the read already shows elsewhere.
 */
export async function linkSummary(
  ctx: RepositoryContext,
  identity: SessionIdentity,
  entityId: string,
  exclude: readonly ContextEntityType[] = [],
): Promise<RecordLinks> {
  const messages = messageLinks(ctx, identity, entityId);
  const records = recordLinks(
    ctx,
    entityId,
    contextEntityTypes.filter((type) => !exclude.includes(type)),
  );
  return {
    messages: await messages.rows(0, linkPreview.messages),
    messageCount: await messages.count(),
    records: await records.rows(linkPreview.records),
    recordCount: await records.count(),
  };
}

export async function listLinkedMessages(
  ctx: RepositoryContext,
  identity: SessionIdentity,
  input: McpInput<"list_linked_messages">,
): Promise<McpOutput<"list_linked_messages">> {
  const target = await requireContextTarget(ctx, input.target.id);
  if (target.entityType !== input.target.type) throw new AccessDeniedError();
  const p = pagination(ctx.scope, "list_linked_messages", input);
  const links = messageLinks(ctx, identity, input.target.id, input.kind);
  return p.page(await links.rows(p.offset, p.take));
}
