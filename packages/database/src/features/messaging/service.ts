import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { DatabaseExecutor } from "../../client";
import { ensureHumanActor } from "../../core/actors/provisioning";
import { actors } from "../../core/actors/schema";
import { user } from "../../core/authentication/schema";
import { member } from "../../core/organizations/schema";
import { RepositoryContext } from "../../core/repository-context";
import { AccessDeniedError, ConflictError, ValidationError } from "../../errors";
import { applyMessageEffects } from "../context/message-effects";
import { visibleConversations, type MessagingIdentity } from "./access";
export type { MessagingIdentity as MessagingScope } from "./access";
import {
  messagingConversations as conversations,
  messagingMessages as messages,
  messagingParticipants as participants,
  messagingReactions as reactions,
} from "./schema";

export interface CreateConversationInput {
  kind: "dm" | "group" | "channel";
  name?: string;
  private?: boolean;
  emails?: string[];
}

// Trusted server facade: identity and active organization must come from the session.
export function createMessagingService(
  db: DatabaseExecutor,
  authenticatedScope: MessagingIdentity,
) {
  const scope = Object.freeze({
    userId: authenticatedScope.userId,
    organizationId: authenticatedScope.organizationId,
  });

  async function authenticate(tx: DatabaseExecutor) {
    const [identity] = await tx
      .select()
      .from(user)
      .innerJoin(member, eq(member.userId, user.id))
      .where(
        and(
          eq(user.id, scope.userId),
          eq(user.emailVerified, true),
          eq(member.organizationId, scope.organizationId),
        ),
      );
    if (!identity) throw new AccessDeniedError();
    const actor = await ensureHumanActor(tx, { ...scope, name: identity.user.name });
    await new RepositoryContext(tx, {
      organizationId: scope.organizationId,
      actorEntityId: actor.entityId,
    }).requireActiveActor();
  }

  async function requireConversation(tx: DatabaseExecutor, id: string) {
    const [conversation] = await tx
      .select()
      .from(conversations)
      .where(and(eq(conversations.id, id), visibleConversations(tx, scope)))
      .for("update");
    if (!conversation) throw new AccessDeniedError();
    return conversation;
  }

  async function join(tx: DatabaseExecutor, conversationId: string) {
    await tx
      .insert(participants)
      .values({ conversationId, ...scope })
      .onConflictDoNothing();
  }

  async function discover(tx: DatabaseExecutor, email: string) {
    const normalized = email.trim().toLowerCase();
    if (!normalized || !normalized.includes("@"))
      throw new ValidationError("An exact email address is required.");
    return tx
      .select({
        userId: user.id,
        name: user.name,
        email: user.email,
        organizationId: member.organizationId,
      })
      .from(user)
      .innerJoin(member, eq(member.userId, user.id))
      .where(and(sql`lower(${user.email}) = ${normalized}`, eq(user.emailVerified, true)))
      .orderBy(asc(member.organizationId));
  }

  async function recipients(tx: DatabaseExecutor, emails: string[]) {
    if (emails.length > 100) throw new ValidationError("At most 100 recipients are allowed.");
    const result = new Map<string, { userId: string; organizationId: string }>();
    for (const email of emails) {
      const matches = await discover(tx, email);
      const recipient =
        matches.find((candidate) => candidate.organizationId === scope.organizationId) ??
        matches[0];
      if (!recipient)
        throw new ValidationError(
          "Recipient must have a verified account and organization membership.",
        );
      if (recipient.userId !== scope.userId) result.set(recipient.userId, recipient);
    }
    return [...result.values()];
  }

  return {
    async listConversations() {
      return db.transaction(async (tx) => {
        await authenticate(tx);
        const rows = await tx
          .select()
          .from(conversations)
          .where(visibleConversations(tx, scope))
          .orderBy(asc(conversations.createdAt), asc(conversations.id));
        const names = rows.length
          ? await tx
              .select({
                conversationId: participants.conversationId,
                userId: user.id,
                name: user.name,
                organizationId: participants.organizationId,
              })
              .from(participants)
              .innerJoin(user, eq(user.id, participants.userId))
              .where(
                inArray(
                  participants.conversationId,
                  rows.map((row) => row.id),
                ),
              )
              .orderBy(asc(user.name), asc(user.id))
          : [];
        return rows.map((row) => ({
          ...row,
          partner: names.some(
            (participant) =>
              participant.conversationId === row.id &&
              participant.organizationId !== scope.organizationId,
          ),
          name:
            row.name ??
            (names
              .filter(
                (participant) =>
                  participant.conversationId === row.id && participant.userId !== scope.userId,
              )
              .map((participant) => participant.name)
              .join(", ") ||
              null),
        }));
      });
    },
    async discoverMembers(email: string) {
      return db.transaction(async (tx) => {
        await authenticate(tx);
        return discover(tx, email);
      });
    },
    async createConversation(input: CreateConversationInput) {
      return db.transaction(async (tx) => {
        await authenticate(tx);
        if (!["dm", "group", "channel"].includes(input.kind))
          throw new ValidationError("Invalid conversation kind.");
        const selected = await recipients(tx, input.emails ?? []);
        if (input.kind === "dm" && selected.length !== 1)
          throw new ValidationError("A DM requires exactly one recipient.");
        if (input.kind === "group" && selected.length < 2)
          throw new ValidationError("A group DM requires at least two recipients.");
        const name = input.name?.trim() || null;
        if (input.kind === "channel" && !name)
          throw new ValidationError("Channels require a name.");
        const [conversation] = await tx
          .insert(conversations)
          .values({
            organizationId: scope.organizationId,
            createdBy: scope.userId,
            kind: input.kind,
            name,
            private: input.kind === "channel" ? (input.private ?? false) : true,
          })
          .returning();
        await tx.insert(participants).values([
          { conversationId: conversation!.id, ...scope },
          ...selected.map((recipient) => ({
            conversationId: conversation!.id,
            userId: recipient.userId,
            organizationId: recipient.organizationId,
          })),
        ]);
        return conversation!;
      });
    },
    async listMembers(conversationId: string) {
      return db.transaction(async (tx) => {
        await authenticate(tx);
        await requireConversation(tx, conversationId);
        return tx
          .select({
            userId: user.id,
            name: user.name,
            email: user.email,
            organizationId: participants.organizationId,
          })
          .from(participants)
          .innerJoin(user, eq(user.id, participants.userId))
          .where(eq(participants.conversationId, conversationId))
          .orderBy(asc(user.name), asc(user.id));
      });
    },
    async addMembers(conversationId: string, emails: string[]) {
      return db.transaction(async (tx) => {
        await authenticate(tx);
        const conversation = await requireConversation(tx, conversationId);
        if (conversation.kind === "dm" || conversation.createdBy !== scope.userId)
          throw new AccessDeniedError();
        const selected = await recipients(tx, emails);
        if (!selected.length) return { added: 0 };
        const added = await tx
          .insert(participants)
          .values(
            selected.map((recipient) => ({
              conversationId,
              userId: recipient.userId,
              organizationId: recipient.organizationId,
            })),
          )
          .onConflictDoNothing()
          .returning();
        return { added: added.length };
      });
    },
    async listMessages(
      conversationId: string,
      threadId?: string,
      options: { beforeMessageId?: string; aroundMessageId?: string } = {},
    ) {
      return db.transaction(async (tx) => {
        await authenticate(tx);
        await requireConversation(tx, conversationId);
        if (threadId) {
          const [root] = await tx
            .select()
            .from(messages)
            .where(
              and(
                eq(messages.conversationId, conversationId),
                eq(messages.id, threadId),
                isNull(messages.threadId),
              ),
            );
          if (!root)
            throw new ValidationError("Thread must be a root message in this conversation.");
        }
        let boundary;
        const anchorId = options.beforeMessageId ?? options.aroundMessageId;
        if (anchorId) {
          const [anchor] = await tx
            .select()
            .from(messages)
            .where(
              and(
                eq(messages.id, anchorId),
                eq(messages.conversationId, conversationId),
                threadId ? eq(messages.threadId, threadId) : isNull(messages.threadId),
              ),
            );
          if (!anchor) throw new AccessDeniedError();
          boundary = options.beforeMessageId
            ? sql`(${messages.createdAt}, ${messages.id}) < (select anchor.created_at, anchor.id from ${messages} anchor where anchor.id = ${anchor.id}::uuid)`
            : sql`(${messages.createdAt}, ${messages.id}) <= (select anchor.created_at, anchor.id from ${messages} anchor where anchor.id = ${anchor.id}::uuid)`;
        }
        const rows = await tx
          .select({ message: messages, authorName: user.name })
          .from(messages)
          .innerJoin(user, eq(user.id, messages.authorId))
          .where(
            and(
              eq(messages.conversationId, conversationId),
              threadId ? eq(messages.threadId, threadId) : isNull(messages.threadId),
              boundary,
            ),
          )
          .orderBy(desc(messages.createdAt), desc(messages.id))
          .limit(50);
        rows.reverse();
        const allReactions = rows.length
          ? await tx
              .select()
              .from(reactions)
              .where(
                inArray(
                  reactions.messageId,
                  rows.map((row) => row.message.id),
                ),
              )
          : [];
        const replies = await tx
          .select({ threadId: messages.threadId, count: sql<number>`count(*)::int` })
          .from(messages)
          .where(
            and(
              eq(messages.conversationId, conversationId),
              inArray(
                messages.threadId,
                rows.filter((row) => !row.message.threadId).map((row) => row.message.id),
              ),
            ),
          )
          .groupBy(messages.threadId);
        return rows.map(({ message, authorName }) => {
          const grouped = new Map<string, { emoji: string; count: number; reacted: boolean }>();
          for (const reaction of allReactions.filter(
            (reaction) => reaction.messageId === message.id,
          )) {
            const item = grouped.get(reaction.emoji) ?? {
              emoji: reaction.emoji,
              count: 0,
              reacted: false,
            };
            item.count++;
            item.reacted ||= reaction.userId === scope.userId;
            grouped.set(reaction.emoji, item);
          }
          return {
            ...message,
            authorName,
            replyCount: replies.find((reply) => reply.threadId === message.id)?.count ?? 0,
            reactions: [...grouped.values()],
          };
        });
      });
    },
    async sendMessage(conversationId: string, body: string, threadId?: string, requestId?: string) {
      return db.transaction(async (tx) => {
        await authenticate(tx);
        await requireConversation(tx, conversationId);
        if (!body.trim() || body.length > 20000)
          throw new ValidationError("Message must contain 1 to 20000 characters.");
        if (requestId) {
          const [existing] = await tx
            .select()
            .from(messages)
            .where(and(eq(messages.authorId, scope.userId), eq(messages.requestId, requestId)));
          if (existing) {
            if (
              existing.conversationId !== conversationId ||
              existing.body !== body ||
              existing.threadId !== (threadId ?? null)
            )
              throw new ConflictError("This request was already used for another message.");
            const [author] = await tx
              .select({ name: user.name })
              .from(user)
              .where(eq(user.id, scope.userId));
            const reactions: { emoji: string; count: number; reacted: boolean }[] = [];
            return { ...existing, authorName: author!.name, reactions, replyCount: 0 };
          }
        }
        if (threadId) {
          const [root] = await tx
            .select()
            .from(messages)
            .where(
              and(
                eq(messages.conversationId, conversationId),
                eq(messages.id, threadId),
                isNull(messages.threadId),
              ),
            );
          if (!root)
            throw new ValidationError("Thread must be a root message in this conversation.");
        }
        await join(tx, conversationId);
        const [message] = await tx
          .insert(messages)
          .values({ conversationId, authorId: scope.userId, body, threadId, requestId })
          .returning();
        const [actor] = await tx
          .select()
          .from(actors)
          .where(
            and(eq(actors.organizationId, scope.organizationId), eq(actors.userId, scope.userId)),
          );
        await applyMessageEffects(
          new RepositoryContext(tx, {
            organizationId: scope.organizationId,
            actorEntityId: actor!.entityId,
          }),
          scope,
          message!,
        );
        const [author] = await tx
          .select({ name: user.name })
          .from(user)
          .where(eq(user.id, scope.userId));
        const initialReactions: { emoji: string; count: number; reacted: boolean }[] = [];
        return {
          ...message!,
          authorName: author!.name,
          replyCount: 0,
          reactions: initialReactions,
        };
      });
    },
    async toggleReaction(messageId: string, emoji: string) {
      return db.transaction(async (tx) => {
        await authenticate(tx);
        if (!emoji.trim() || emoji.length > 64)
          throw new ValidationError("Reaction must contain 1 to 64 characters.");
        const [message] = await tx.select().from(messages).where(eq(messages.id, messageId));
        if (!message) throw new AccessDeniedError();
        await requireConversation(tx, message.conversationId);
        await join(tx, message.conversationId);
        const key = and(
          eq(reactions.messageId, messageId),
          eq(reactions.userId, scope.userId),
          eq(reactions.emoji, emoji),
        );
        const removed = await tx.delete(reactions).where(key).returning();
        if (removed.length) return { active: false };
        await tx.insert(reactions).values({
          conversationId: message.conversationId,
          messageId,
          userId: scope.userId,
          emoji,
        });
        return { active: true };
      });
    },
  };
}
