import type { DatabaseExecutor } from "../../client";
import { actorDisplayName } from "../../core/actors/display-name";
import { actors } from "../../core/actors/schema";
import { userAgents } from "../../core/actors/user-agents.schema";
import { member } from "../../core/organizations/schema";
import type { RepositoryContext } from "../../core/repository-context";
import { AccessDeniedError, ConflictError, ValidationError } from "../../errors";
import { routeWake } from "../agent-work/router";
import { applyMessageEffects } from "../context/message-effects";
import { messageChangeHints } from "../realtime/routing";
import {
  loadConversation,
  requireThreadRoot,
  type MessagingIdentity,
  messagingSession,
} from "./access";
import { writeMembers } from "./members";
import { validateBody, validateEmoji } from "./policy";
import { messagingProfile } from "./profiles";
import { messagingMessages, messagingReactions } from "./schema";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";

// Requires a join of `actors` on author_actor_entity_id.
export function messageAuthorColumns(organizationId: string) {
  return {
    authorName: actorDisplayName(),
    authorType: sql<"human" | "agent">`${actors.type}`,
    authorExternal: sql<boolean>`${actors.type} <> 'agent' AND not exists (
      select 1 from ${member}
      where ${member.userId} = ${actors.userId}
        and ${member.organizationId} = ${organizationId}
    )`,
  };
}

export async function messageSummaries(
  db: DatabaseExecutor,
  viewerActorEntityId: string,
  conversationId: string,
  rows: { id: string; threadId: string | null }[],
) {
  const roots = rows.flatMap((row) => (row.threadId ? [] : [row.id]));
  const [allReactions, replies] = await Promise.all([
    rows.length
      ? db
          .select({
            messageId: messagingReactions.messageId,
            emoji: messagingReactions.emoji,
            count: sql<number>`count(*)::int`,
            reacted: sql<boolean>`bool_or(${messagingReactions.actorEntityId} = ${viewerActorEntityId})`,
          })
          .from(messagingReactions)
          .where(
            inArray(
              messagingReactions.messageId,
              rows.map((row) => row.id),
            ),
          )
          .groupBy(messagingReactions.messageId, messagingReactions.emoji)
      : [],
    roots.length
      ? db
          .select({ threadId: messagingMessages.threadId, count: sql<number>`count(*)::int` })
          .from(messagingMessages)
          .where(
            and(
              eq(messagingMessages.conversationId, conversationId),
              inArray(messagingMessages.threadId, roots),
            ),
          )
          .groupBy(messagingMessages.threadId)
      : [],
  ]);
  const replyCounts = new Map(replies.map((reply) => [reply.threadId, reply.count]));
  const byMessage = new Map<string, { emoji: string; count: number; reacted: boolean }[]>();
  for (const { messageId, ...reaction } of allReactions) {
    const group = byMessage.get(messageId) ?? [];
    group.push(reaction);
    byMessage.set(messageId, group);
  }
  return new Map(
    rows.map((row) => [
      row.id,
      {
        replyCount: replyCounts.get(row.id) ?? 0,
        reactions: byMessage.get(row.id) ?? [],
      },
    ]),
  );
}

// Trusted callers pass the context and author already resolved by workspaceContext.
export async function sendMessageAs(
  ctx: RepositoryContext,
  scope: MessagingIdentity,
  author: { actor: { entityId: string; type: "human" | "agent" }; authorName: string },
  message: {
    conversationId: string;
    body: string;
    threadId?: string;
    requestId?: string;
    /** The agent turn that published this reply. Agents only. */
    originTurnId?: string;
  },
) {
  const { db: tx } = ctx;
  const { actor, authorName } = author;
  const { conversationId, body, threadId, requestId, originTurnId } = message;
  if (originTurnId && actor.type !== "agent")
    throw new ValidationError("Only agent replies record a turn.");
  const conversation = await loadConversation(tx, scope, conversationId, "share");
  validateBody(body);
  if (requestId) {
    const [existing] = await tx
      .select()
      .from(messagingMessages)
      .where(
        and(
          eq(messagingMessages.authorActorEntityId, actor.entityId),
          eq(messagingMessages.requestId, requestId),
        ),
      );
    if (existing) {
      if (
        existing.conversationId !== conversationId ||
        existing.body !== body ||
        existing.threadId !== (threadId ?? null)
      )
        throw new ConflictError("This request was already used for another message.");
      const reactions: { emoji: string; count: number; reacted: boolean }[] = [];
      return {
        ...existing,
        authorName,
        authorType: actor.type,
        reactions,
        replyCount: 0,
        // A replay changes nothing. The hint still lets viewers recover from a lost first publish.
        hints: messageChangeHints(
          { conversationId, organizationId: scope.organizationId },
          { joined: false },
        ),
      };
    }
  }
  if (threadId) await requireThreadRoot(tx, conversationId, threadId);
  let joined = false;
  // Posting rejoins a public channel the person left. Private conversations are not visible after
  // leaving, so the access check fails first.
  const self = { ...actor, organizationId: scope.organizationId };
  if (actor.type === "agent") await writeMembers(tx, conversationId, [self], "author");
  else joined = (await writeMembers(tx, conversationId, [self], "join")).length > 0;
  const [created] = await tx
    .insert(messagingMessages)
    .values({
      conversationId,
      authorActorEntityId: actor.entityId,
      authorOrganizationId: scope.organizationId,
      body,
      threadId,
      requestId,
      originTurnId,
    })
    .returning();
  const effects = await applyMessageEffects(ctx, scope, created!, conversation.organizationId);
  const wakeHints = await routeWake(tx, scope, created!, conversation.kind);
  const initialReactions: { emoji: string; count: number; reacted: boolean }[] = [];
  return {
    ...created!,
    authorName,
    authorType: actor.type,
    replyCount: 0,
    reactions: initialReactions,
    // Publish only after the caller's transaction commits. Wake hints reach the author's desktops.
    hints: [
      ...messageChangeHints(
        { conversationId, organizationId: scope.organizationId },
        { joined, ...effects },
      ),
      ...wakeHints,
    ],
  };
}

// Reading, posting and reacting. Scope comes from the authenticated session.
export function messageOperations(db: DatabaseExecutor, scope: Readonly<MessagingIdentity>) {
  const authenticate = (tx: DatabaseExecutor) => messagingSession(tx, scope);

  return {
    async listMessages(
      conversationId: string,
      threadId?: string,
      options: { beforeMessageId?: string; aroundMessageId?: string } = {},
    ) {
      return db.transaction(async (tx) => {
        const { actor } = await authenticate(tx);
        await loadConversation(tx, scope, conversationId);
        if (threadId) await requireThreadRoot(tx, conversationId, threadId);
        let boundary;
        const anchorId = options.beforeMessageId ?? options.aroundMessageId;
        if (anchorId) {
          const [anchor] = await tx
            .select({ id: messagingMessages.id })
            .from(messagingMessages)
            .where(
              and(
                eq(messagingMessages.id, anchorId),
                eq(messagingMessages.conversationId, conversationId),
                threadId
                  ? eq(messagingMessages.threadId, threadId)
                  : isNull(messagingMessages.threadId),
              ),
            );
          if (!anchor) throw new AccessDeniedError();
          boundary = options.beforeMessageId
            ? sql`(${messagingMessages.createdAt}, ${messagingMessages.id}) < (select anchor.created_at, anchor.id from ${messagingMessages} anchor where anchor.id = ${anchor.id}::uuid)`
            : sql`(${messagingMessages.createdAt}, ${messagingMessages.id}) <= (select anchor.created_at, anchor.id from ${messagingMessages} anchor where anchor.id = ${anchor.id}::uuid)`;
        }
        const rows = await tx
          .select({
            message: messagingMessages,
            ...messageAuthorColumns(scope.organizationId),
            authorOwnerUserId: userAgents.userId,
          })
          .from(messagingMessages)
          .innerJoin(actors, eq(actors.entityId, messagingMessages.authorActorEntityId))
          .leftJoin(userAgents, eq(userAgents.id, actors.userAgentId))
          .where(
            and(
              eq(messagingMessages.conversationId, conversationId),
              threadId
                ? eq(messagingMessages.threadId, threadId)
                : isNull(messagingMessages.threadId),
              boundary,
            ),
          )
          .orderBy(desc(messagingMessages.createdAt), desc(messagingMessages.id))
          .limit(50);
        rows.reverse();
        const summaries = await messageSummaries(
          tx,
          actor.entityId,
          conversationId,
          rows.map((row) => row.message),
        );
        return rows.map(
          ({ message, authorName, authorExternal, authorType, authorOwnerUserId }) => ({
            ...message,
            // Which agent turn published a reply is private to the agent's owner.
            originTurnId: authorOwnerUserId === scope.userId ? message.originTurnId : null,
            authorName,
            authorExternal,
            authorType,
            ...summaries.get(message.id)!,
          }),
        );
      });
    },
    async getProfile(conversationId: string, actorEntityId: string) {
      return db.transaction(async (tx) => {
        const { actor } = await authenticate(tx);
        return messagingProfile(tx, scope, actor.entityId, conversationId, actorEntityId);
      });
    },
    async sendMessage(conversationId: string, body: string, threadId?: string, requestId?: string) {
      return db.transaction(async (tx) => {
        const { context, ...author } = await authenticate(tx);
        return sendMessageAs(context, scope, author, { conversationId, body, threadId, requestId });
      });
    },
    async toggleReaction(messageId: string, emoji: string) {
      if (scope.actorEntityId) throw new AccessDeniedError();
      return db.transaction(async (tx) => {
        const { actor } = await authenticate(tx);
        validateEmoji(emoji);
        const [message] = await tx
          .select({ conversationId: messagingMessages.conversationId })
          .from(messagingMessages)
          .where(eq(messagingMessages.id, messageId));
        if (!message) throw new AccessDeniedError();
        await loadConversation(tx, scope, message.conversationId, "share");
        const joined =
          (
            await writeMembers(
              tx,
              message.conversationId,
              [{ ...actor, organizationId: scope.organizationId }],
              "join",
            )
          ).length > 0;
        const hints = messageChangeHints(
          { conversationId: message.conversationId, organizationId: scope.organizationId },
          { joined },
        );
        const key = and(
          eq(messagingReactions.messageId, messageId),
          eq(messagingReactions.actorEntityId, actor.entityId),
          eq(messagingReactions.emoji, emoji),
        );
        const removed = await tx.delete(messagingReactions).where(key).returning();
        if (removed.length) return { active: false, hints };
        // The shared conversation lock lets toggles run together. If a concurrent toggle added
        // this reaction, the insert waits for it to commit and this toggle removes it.
        const added = await tx
          .insert(messagingReactions)
          .values({
            conversationId: message.conversationId,
            messageId,
            actorEntityId: actor.entityId,
            emoji,
          })
          .onConflictDoNothing()
          .returning();
        if (added.length) return { active: true, hints };
        await tx.delete(messagingReactions).where(key);
        return { active: false, hints };
      });
    },
  };
}
