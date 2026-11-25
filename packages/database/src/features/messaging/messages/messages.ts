import {
  joinActorProfile,
  joinedActorName,
  joinedActorPicture,
} from "../../../core/actors/joined-profile";
import { actors } from "../../../core/actors/schema";
import { userAgents } from "../../../core/actors/user-agents.schema";
import { effectsFor } from "../../../core/effects";
import type { DatabaseExecutor } from "../../../core/executor";
import { member } from "../../../core/organizations/schema";
import type { RepositoryContext } from "../../../core/repository-context";
import type { SessionIdentity } from "../../../core/session/identity";
import type { MessagingReader, MessagingSessionResolver } from "../../../core/session/messaging";
import { storedFiles } from "../../../core/storage/schema";
import { AccessDeniedError, ConflictError, ValidationError } from "../../../errors";
import { routeWake } from "../../agent-work/wakes/router";
import { applyMessageEffects } from "../../context/message-references/message-effects";
import { insertMessageAttachments, messageAttachmentMetadata } from "../../files/metadata";
import { publishFiles } from "../../files/publication";
import { messageAttachments } from "../../files/schema";
import { requireUnarchived } from "../../projects/archive";
import { messageChangeHints, reactionChangeHints } from "../../realtime/routing";
import { loadConversation, requireThreadRoot, threadRoot, visibleConversations } from "../access";
import { writeMembers } from "../conversations/members";
import { validateBody, validateEmoji } from "../policy";
import { messagingProfile } from "../profiles";
import { messagingConversations, messagingMessages, messagingReactions } from "../schema";
import { and, desc, eq, exists, inArray, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

// selectMessages joins account, agent and viewer-organization membership once per author.
function messageAuthorColumns(scope: SessionIdentity) {
  return {
    authorName: joinedActorName(),
    authorImage: joinedActorPicture(scope.userId),
    authorType: sql<"human" | "agent">`${actors.type}`,
    authorExternal: sql<boolean>`${actors.type} <> 'agent' AND ${member.id} is null`,
  };
}

async function messageSummaries(
  db: DatabaseExecutor,
  viewerActorEntityId: string,
  conversationId: string | string[],
  rows: { id: string; threadId: string | null; deletedAt: Date | null }[],
) {
  const roots = rows.flatMap((row) => (row.threadId ? [] : [row.id]));
  // A reaction can land on a message deleted at the same instant. Deleted messages show none.
  const live = rows.flatMap((row) => (row.deletedAt ? [] : [row.id]));
  const [allReactions, replies] = await Promise.all([
    live.length
      ? db
          .select({
            messageId: messagingReactions.messageId,
            emoji: messagingReactions.emoji,
            count: sql<number>`count(*)::int`,
            reacted: sql<boolean>`bool_or(${messagingReactions.actorEntityId} = ${viewerActorEntityId})`,
          })
          .from(messagingReactions)
          .where(inArray(messagingReactions.messageId, live))
          .groupBy(messagingReactions.messageId, messagingReactions.emoji)
      : [],
    roots.length
      ? db
          .select({ threadId: messagingMessages.threadId, count: sql<number>`count(*)::int` })
          .from(messagingMessages)
          .where(
            and(
              Array.isArray(conversationId)
                ? inArray(messagingMessages.conversationId, conversationId)
                : eq(messagingMessages.conversationId, conversationId),
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

// The client view of a message. A request ID is private to the message's author.
function messageView(message: typeof messagingMessages.$inferSelect, viewerActorEntityId: string) {
  return {
    id: message.id,
    conversationId: message.conversationId,
    authorActorEntityId: message.authorActorEntityId,
    body: message.body,
    requestId: message.authorActorEntityId === viewerActorEntityId ? message.requestId : null,
    threadId: message.threadId,
    originTurnId: message.originTurnId,
    editedAt: message.editedAt,
    deletedAt: message.deletedAt,
    createdAt: message.createdAt,
  };
}

// Messages with their author. Callers add the filters that authorize each message.
export function selectMessages(db: DatabaseExecutor, scope: SessionIdentity) {
  return joinActorProfile(
    db
      .select({
        message: messagingMessages,
        ...messageAuthorColumns(scope),
        authorOwnerUserId: userAgents.userId,
      })
      .from(messagingMessages)
      .innerJoin(actors, eq(actors.entityId, messagingMessages.authorActorEntityId))
      .$dynamic(),
    scope.organizationId,
  );
}

// Adds attachments, reactions and reply counts to authorized messages of the given conversations.
export async function messageViews(
  db: DatabaseExecutor,
  scope: SessionIdentity,
  viewerActorEntityId: string,
  conversationId: string | string[],
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
    ...messageView(message, viewerActorEntityId),
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
  const conversation = await loadConversation(tx, scope, conversationId);
  if (conversation.taskEntityId) {
    await ctx.requireAccess(conversation.taskEntityId, "comment");
    await requireUnarchived(ctx, [conversation.taskEntityId]);
  }
  validateBody(body, fileIds.length);
  const findRequest = async (id: string) => {
    const [existing] = await tx
      .select()
      .from(messagingMessages)
      .where(
        and(
          eq(messagingMessages.authorActorEntityId, actor.entityId),
          eq(messagingMessages.requestId, id),
        ),
      );
    return existing;
  };
  const replay = async (existing: typeof messagingMessages.$inferSelect) => {
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
        {
          conversationId,
          organizationId: scope.organizationId,
          messageId: existing.id,
          threadId: existing.threadId,
        },
        { joined: false },
      ),
    );
    return {
      ...messageView(existing, actor.entityId),
      attachments,
      authorName,
      authorType: actor.type,
      reactions,
      replyCount: 0,
    };
  };
  if (requestId) {
    const existing = await findRequest(requestId);
    if (existing) return replay(existing);
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
    // A concurrent send with this request waits for the first to commit, then replays it.
    .onConflictDoNothing({
      target: [messagingMessages.authorActorEntityId, messagingMessages.requestId],
    })
    .returning();
  if (!created) {
    const existing = requestId ? await findRequest(requestId) : undefined;
    if (!existing) throw new ConflictError("This request is being retried. Try again.");
    return replay(existing);
  }
  // Publish only for a new message, so a replayed request does not publish its files again.
  await publishFiles(ctx, conversation, fileIds);
  const attachments = await insertMessageAttachments(
    tx,
    {
      conversationId,
      messageId: created.id,
      fileOrganizationId: scope.organizationId,
      addedByActorEntityId: actor.entityId,
    },
    fileIds,
  );
  const effects = await applyMessageEffects(ctx, scope, created, conversation);
  const wakeHints = conversation.taskEntityId
    ? []
    : await routeWake(tx, scope, created, conversation.kind);
  for (const hint of [
    ...messageChangeHints(
      {
        conversationId,
        organizationId: scope.organizationId,
        messageId: created.id,
        threadId: created.threadId,
      },
      { joined, ...effects },
    ),
    ...wakeHints,
  ])
    ctx.effects.hint(hint);
  const initialReactions: { emoji: string; count: number; reacted: boolean }[] = [];
  return {
    ...messageView(created, actor.entityId),
    attachments,
    authorName,
    authorType: actor.type,
    replyCount: 0,
    reactions: initialReactions,
  };
}

// Reading, posting and reacting. Scope comes from the authenticated session.
export function messageOperations(
  db: DatabaseExecutor,
  scope: Readonly<SessionIdentity>,
  authenticate: MessagingSessionResolver,
  read: MessagingReader,
) {
  return {
    async listMessages(
      conversationId: string,
      threadId?: string,
      options: { beforeMessageId?: string; aroundMessageId?: string; afterMessageId?: string } = {},
    ) {
      const { actor } = await authenticate(db);
      const pageCondition = and(
        eq(messagingMessages.conversationId, conversationId),
        threadId ? eq(messagingMessages.threadId, threadId) : isNull(messagingMessages.threadId),
      );
      const anchorId = options.beforeMessageId ?? options.aroundMessageId ?? options.afterMessageId;
      const anchor = db.$with("page_anchor").as(
        db
          .select({ id: messagingMessages.id, at: messagingMessages.createdAt })
          .from(messagingMessages)
          .where(and(pageCondition, anchorId ? eq(messagingMessages.id, anchorId) : sql`false`)),
      );
      const conversation = db.$with("authorized_conversation").as(
        db
          .select({
            id: messagingConversations.id,
            validThread: (threadId
              ? sql<boolean>`${exists(db.select({ id: messagingMessages.id }).from(messagingMessages).where(threadRoot(conversationId, threadId)))}`
              : sql<boolean>`true`
            ).as("valid_thread"),
            validAnchor: (anchorId
              ? sql<boolean>`${exists(db.select({ id: anchor.id }).from(anchor))}`
              : sql<boolean>`true`
            ).as("valid_anchor"),
          })
          .from(messagingConversations)
          .where(
            and(eq(messagingConversations.id, conversationId), visibleConversations(db, scope)),
          ),
      );
      let boundary;
      if (anchorId) {
        const position = sql`(${messagingMessages.createdAt}, ${messagingMessages.id})`;
        const at = sql`(select ${anchor.at}, ${anchor.id} from ${anchor})`;
        if (options.beforeMessageId) boundary = sql`${position} < ${at}`;
        else if (options.aroundMessageId) boundary = sql`${position} <= ${at}`;
        else boundary = sql`${position} > ${at}`;
      }
      const page = db.$with("message_page").as(
        db
          .select({ id: messagingMessages.id })
          .from(messagingMessages)
          .where(
            and(
              pageCondition,
              exists(
                db
                  .select({ id: conversation.id })
                  .from(conversation)
                  .where(and(conversation.validThread, conversation.validAnchor)),
              ),
              boundary,
            ),
          )
          .orderBy(desc(messagingMessages.createdAt), desc(messagingMessages.id))
          .limit(50),
      );
      const reply = alias(messagingMessages, "page_reply");
      // Aggregate each relationship independently, after limiting the page. Joining the raw
      // attachments, reactions and replies would multiply both rows and summary counts.
      const query = db
        .with(anchor, conversation, page)
        .select({
          validThread: conversation.validThread,
          validAnchor: conversation.validAnchor,
          message: messagingMessages,
          ...messageAuthorColumns(scope),
          authorOwnerUserId: userAgents.userId,
          attachments: sql<Awaited<ReturnType<typeof messageAttachmentMetadata>>>`coalesce((
            select json_agg(json_build_object(
              'id', ${messageAttachments.id}, 'messageId', ${messageAttachments.messageId},
              'position', ${messageAttachments.position}, 'fileId', ${storedFiles.id},
              'filename', ${storedFiles.filename}, 'size', ${storedFiles.size},
              'contentType', ${storedFiles.contentType}
            ) order by ${messageAttachments.position})
            from ${messageAttachments}
            inner join ${storedFiles} on ${storedFiles.id} = ${messageAttachments.fileId}
            where ${messageAttachments.messageId} = ${messagingMessages.id}
              and ${messagingMessages.deletedAt} is null
          ), '[]'::json)`,
          reactions: sql<{ emoji: string; count: number; reacted: boolean }[]>`coalesce((
            select json_agg(reaction) from (
              select ${messagingReactions.emoji} as emoji, count(*)::int as count,
                bool_or(${messagingReactions.actorEntityId} = ${actor.entityId}) as reacted
              from ${messagingReactions}
              where ${messagingReactions.messageId} = ${messagingMessages.id}
                and ${messagingMessages.deletedAt} is null
              group by ${messagingReactions.emoji}
            ) reaction
          ), '[]'::json)`,
          replyCount: threadId
            ? sql<number>`0`
            : sql<number>`(${db
                .select({ count: sql<number>`count(*)::int` })
                .from(reply)
                .where(
                  and(
                    eq(reply.conversationId, conversationId),
                    eq(reply.threadId, messagingMessages.id),
                  ),
                )})`,
        })
        // Keep one row for an authorized empty page, including invalid thread/cursor flags.
        .from(conversation)
        .leftJoin(page, sql`true`)
        .leftJoin(messagingMessages, eq(messagingMessages.id, page.id))
        .leftJoin(actors, eq(actors.entityId, messagingMessages.authorActorEntityId))
        .$dynamic();
      const rows = await joinActorProfile(query, scope.organizationId).orderBy(
        desc(messagingMessages.createdAt),
        desc(messagingMessages.id),
      );
      if (!rows.length) throw new AccessDeniedError();
      if (!rows[0]!.validThread)
        throw new ValidationError("Thread must be a root message in this conversation.");
      if (!rows[0]!.validAnchor) throw new AccessDeniedError();
      return rows
        .reverse()
        .flatMap(
          ({ message, authorOwnerUserId, validThread: _thread, validAnchor: _anchor, ...view }) =>
            message
              ? [
                  {
                    ...messageView(message, actor.entityId),
                    canModify:
                      !scope.actorEntityId &&
                      !message.deletedAt &&
                      message.authorActorEntityId === actor.entityId,
                    body: message.deletedAt ? "" : message.body,
                    originTurnId: authorOwnerUserId === scope.userId ? message.originTurnId : null,
                    ...view,
                  },
                ]
              : [],
        );
    },
    async getProfile(conversationId: string, actorEntityId: string) {
      return read(async (tx) => {
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
        const { actor, context } = await authenticate(tx);
        validateEmoji(emoji);
        const [message] = await tx
          .select({
            conversationId: messagingMessages.conversationId,
            threadId: messagingMessages.threadId,
            deletedAt: messagingMessages.deletedAt,
          })
          .from(messagingMessages)
          .where(eq(messagingMessages.id, messageId));
        if (!message || message.deletedAt) throw new AccessDeniedError();
        const conversation = await loadConversation(tx, scope, message.conversationId);
        if (conversation.taskEntityId) {
          await context.requireAccess(conversation.taskEntityId, "comment");
          await requireUnarchived(context, [conversation.taskEntityId]);
        }
        const joined =
          (
            await writeMembers(
              tx,
              message.conversationId,
              [{ ...actor, organizationId: scope.organizationId }],
              "join",
            )
          ).length > 0;
        const hints = reactionChangeHints(
          {
            conversationId: message.conversationId,
            threadId: message.threadId,
            messageId,
            organizationId: scope.organizationId,
          },
          joined,
        );
        for (const hint of hints) effectsFor(tx).hint(hint);
        const key = and(
          eq(messagingReactions.messageId, messageId),
          eq(messagingReactions.actorEntityId, actor.entityId),
          eq(messagingReactions.emoji, emoji),
        );
        const removed = await tx.delete(messagingReactions).where(key).returning();
        if (removed.length) return { active: false };
        // The insert adds the reaction only while the message is live. A deletion at the same
        // instant can still leave the row; reads hide the reactions of deleted messages.
        // If a concurrent toggle added this reaction, this toggle removes it.
        const added = await tx
          .insert(messagingReactions)
          .select(
            tx
              .select({
                conversationId: messagingMessages.conversationId,
                messageId: messagingMessages.id,
                actorEntityId: sql<string>`${actor.entityId}::uuid`.as("actor_entity_id"),
                emoji: sql<string>`${emoji}::text`.as("emoji"),
              })
              .from(messagingMessages)
              .where(and(eq(messagingMessages.id, messageId), isNull(messagingMessages.deletedAt))),
          )
          .onConflictDoNothing()
          .returning();
        if (added.length) return { active: true };
        await tx.delete(messagingReactions).where(key);
        return { active: false };
      });
    },
  };
}
