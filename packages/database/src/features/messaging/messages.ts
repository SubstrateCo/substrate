import type { DatabaseExecutor } from "../../client";
import { actorDisplayName } from "../../core/actors/display-name";
import { actorPicture } from "../../core/actors/picture";
import { actors } from "../../core/actors/schema";
import { userAgents } from "../../core/actors/user-agents.schema";
import { effectsFor } from "../../core/effects";
import { member } from "../../core/organizations/schema";
import type { RepositoryContext } from "../../core/repository-context";
import type { SessionIdentity } from "../../core/session/identity";
import { AccessDeniedError, ConflictError, ValidationError } from "../../errors";
import { routeWake } from "../agent-work/router";
import { applyMessageEffects } from "../context/message-effects";
import { messageAttachmentMetadata } from "../files/metadata";
import { publishFiles } from "../files/publication";
import { messageAttachments } from "../files/schema";
import { messageChangeHints } from "../realtime/routing";
import { loadConversation, requireThreadRoot } from "./access";
import { writeMembers } from "./members";
import { validateBody, validateEmoji } from "./policy";
import { messagingProfile } from "./profiles";
import { messagingMessages, messagingReactions } from "./schema";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";

// `author` is the actors table, or its alias, joined on author_actor_entity_id.
function messageAuthorColumns(scope: SessionIdentity, author: typeof actors = actors) {
  return {
    authorName: actorDisplayName(author),
    authorImage: actorPicture(scope, author),
    authorType: sql<"human" | "agent">`${author.type}`,
    authorExternal: sql<boolean>`${author.type} <> 'agent' AND not exists (
      select 1 from ${member}
      where ${member.userId} = ${author.userId}
        and ${member.organizationId} = ${scope.organizationId}
    )`,
  };
}

async function messageSummaries(
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

// Messages with their author. Callers add the filters that authorize each message.
export function selectMessages(db: DatabaseExecutor, scope: SessionIdentity) {
  return db
    .select({
      message: messagingMessages,
      ...messageAuthorColumns(scope),
      authorOwnerUserId: userAgents.userId,
    })
    .from(messagingMessages)
    .innerJoin(actors, eq(actors.entityId, messagingMessages.authorActorEntityId))
    .leftJoin(userAgents, eq(userAgents.id, actors.userAgentId))
    .$dynamic();
}

// Adds attachments, reactions and reply counts to authorized messages of one conversation.
export async function messageViews(
  db: DatabaseExecutor,
  scope: SessionIdentity,
  viewerActorEntityId: string,
  conversationId: string,
  rows: Awaited<ReturnType<typeof selectMessages>>,
) {
  const attachments = await messageAttachmentMetadata(
    db,
    rows.map((row) => row.message.id),
  );
  const summaries = await messageSummaries(
    db,
    viewerActorEntityId,
    conversationId,
    rows.map((row) => row.message),
  );
  return rows.map(({ message, authorOwnerUserId, ...author }) => ({
    ...message,
    canModify:
      !scope.actorEntityId &&
      !message.deletedAt &&
      message.authorActorEntityId === viewerActorEntityId,
    body: message.deletedAt ? "" : message.body,
    attachments: message.deletedAt
      ? []
      : attachments.filter((item) => item.messageId === message.id),
    // Which agent turn published a reply is private to the agent's owner.
    originTurnId: authorOwnerUserId === scope.userId ? message.originTurnId : null,
    ...author,
    ...summaries.get(message.id)!,
  }));
}

// Trusted callers pass the context and author already resolved by workspaceContext.
export async function sendMessageAs(
  ctx: RepositoryContext,
  scope: SessionIdentity,
  author: { actor: { entityId: string; type: "human" | "agent" }; authorName: string },
  message: {
    conversationId: string;
    body: string;
    threadId?: string;
    requestId?: string;
    /** The agent turn that published this reply. Agents only. */
    originTurnId?: string;
    attachmentFileIds?: string[];
  },
) {
  const { db: tx } = ctx;
  const { actor, authorName } = author;
  const { conversationId, body, threadId, requestId, originTurnId } = message;
  const fileIds = message.attachmentFileIds ?? [];
  if (originTurnId && actor.type !== "agent")
    throw new ValidationError("Only agent replies record a turn.");
  const conversation = await loadConversation(tx, scope, conversationId, "share");
  validateBody(body, fileIds.length);
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
      if (existing.deletedAt || existing.editedAt)
        throw new ConflictError("This message has changed since it was sent.");
      const attachments = await messageAttachmentMetadata(tx, [existing.id]);
      const sameAttachments =
        JSON.stringify(attachments.map((item) => item.fileId)) === JSON.stringify(fileIds);
      const sameContent = existing.body === body && sameAttachments;
      if (
        existing.conversationId !== conversationId ||
        !sameContent ||
        existing.threadId !== (threadId ?? null)
      )
        throw new ConflictError("This request was already used for another message.");
      const reactions: { emoji: string; count: number; reacted: boolean }[] = [];
      ctx.effects.replay(
        messageChangeHints(
          { conversationId, organizationId: scope.organizationId },
          { joined: false },
        ),
      );
      return {
        ...existing,
        attachments,
        authorName,
        authorType: actor.type,
        reactions,
        replyCount: 0,
      };
    }
  }
  if (threadId) await requireThreadRoot(tx, conversationId, threadId);
  await publishFiles(ctx, conversation, fileIds);
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
  if (fileIds.length)
    await tx.insert(messageAttachments).values(
      fileIds.map((fileId, position) => ({
        conversationId,
        messageId: created!.id,
        fileOrganizationId: scope.organizationId,
        fileId,
        addedByActorEntityId: actor.entityId,
        position,
      })),
    );
  const attachments = await messageAttachmentMetadata(tx, fileIds.length ? [created!.id] : []);
  const effects = await applyMessageEffects(ctx, scope, created!, conversation);
  const wakeHints = await routeWake(tx, scope, created!, conversation.kind);
  for (const hint of [
    ...messageChangeHints(
      { conversationId, organizationId: scope.organizationId },
      { joined, ...effects },
    ),
    ...wakeHints,
  ])
    ctx.effects.hint(hint);
  const initialReactions: { emoji: string; count: number; reacted: boolean }[] = [];
  return {
    ...created!,
    attachments,
    authorName,
    authorType: actor.type,
    replyCount: 0,
    reactions: initialReactions,
  };
}

// Reading, posting and reacting. Scope comes from the authenticated session.
export function messageOperations(db: DatabaseExecutor, scope: Readonly<SessionIdentity>) {
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
        const rows = await selectMessages(tx, scope)
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
        return messageViews(tx, scope, actor.entityId, conversationId, rows);
      });
    },
    async getProfile(conversationId: string, actorEntityId: string) {
      return db.transaction(async (tx) => {
        const { actor } = await authenticate(tx);
        return messagingProfile(tx, scope, actor.entityId, conversationId, actorEntityId);
      });
    },
    async sendMessage(
      conversationId: string,
      body: string,
      threadId?: string,
      requestId?: string,
      attachmentFileIds?: string[],
    ) {
      return db.transaction(async (tx) => {
        const { context, ...author } = await authenticate(tx);
        return sendMessageAs(context, scope, author, {
          conversationId,
          body,
          threadId,
          requestId,
          attachmentFileIds,
        });
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
        const [live] = await tx
          .select({ deletedAt: messagingMessages.deletedAt })
          .from(messagingMessages)
          .where(eq(messagingMessages.id, messageId));
        if (!live || live.deletedAt) throw new AccessDeniedError();
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
        for (const hint of hints) effectsFor(tx).hint(hint);
        const key = and(
          eq(messagingReactions.messageId, messageId),
          eq(messagingReactions.actorEntityId, actor.entityId),
          eq(messagingReactions.emoji, emoji),
        );
        const removed = await tx.delete(messagingReactions).where(key).returning();
        if (removed.length) return { active: false };
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
        if (added.length) return { active: true };
        await tx.delete(messagingReactions).where(key);
        return { active: false };
      });
    },
  };
}
import { messagingSession } from "../../core/session/messaging";
