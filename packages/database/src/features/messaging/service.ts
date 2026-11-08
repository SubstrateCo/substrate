import type { DatabaseExecutor } from "../../client";
import { ensureHumanActor, ensureOwnedAgentActors } from "../../core/actors/provisioning";
import { actors } from "../../core/actors/schema";
import { userAgents } from "../../core/actors/user-agents.schema";
import { user } from "../../core/authentication/schema";
import { member } from "../../core/organizations/schema";
import { RepositoryContext } from "../../core/repository-context";
import { AccessDeniedError, ConflictError, ValidationError } from "../../errors";
import { workspaceContext } from "../context/access";
import { applyMessageEffects } from "../context/message-effects";
import { visibleConversations, type MessagingIdentity } from "./access";
import { messageSummaries } from "./message-summaries";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
export type { MessagingIdentity as MessagingScope } from "./access";
import {
  messagingConversations as conversations,
  messagingMessages as messages,
  messagingParticipants as participants,
  messagingReactions as reactions,
  messagingAgentParticipants as agentParticipants,
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
    actorEntityId: authenticatedScope.actorEntityId,
  });

  async function authenticate(tx: DatabaseExecutor) {
    if (scope.actorEntityId) {
      await workspaceContext(tx, scope);
      const [actor] = await tx
        .select()
        .from(actors)
        .where(eq(actors.entityId, scope.actorEntityId));
      if (!actor) throw new AccessDeniedError();
      return { actor, authorName: actor.name };
    }
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
    return { actor, authorName: identity.user.name };
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
    if (scope.actorEntityId) {
      await tx
        .insert(agentParticipants)
        .values({
          conversationId,
          organizationId: scope.organizationId,
          actorEntityId: scope.actorEntityId,
        })
        .onConflictDoNothing();
      return;
    }
    await tx
      .insert(participants)
      .values({ conversationId, ...scope })
      .onConflictDoNothing();
  }

  function normalizeEmail(email: string) {
    const normalized = email.trim().toLowerCase();
    if (!normalized || !normalized.includes("@"))
      throw new ValidationError("An exact email address is required.");
    return normalized;
  }

  async function discover(tx: DatabaseExecutor, email: string) {
    const normalized = normalizeEmail(email);
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
    const normalized = [...new Set(emails.map(normalizeEmail))];
    if (!normalized.length) return [];
    const matches = await tx
      .select({
        userId: user.id,
        organizationId: member.organizationId,
        email: sql<string>`lower(${user.email})`,
      })
      .from(user)
      .innerJoin(member, eq(member.userId, user.id))
      .where(and(inArray(sql`lower(${user.email})`, normalized), eq(user.emailVerified, true)))
      .orderBy(asc(member.organizationId));
    const byEmail = new Map<string, typeof matches>();
    for (const match of matches) {
      const group = byEmail.get(match.email) ?? [];
      group.push(match);
      byEmail.set(match.email, group);
    }
    const result = new Map<string, { userId: string; organizationId: string }>();
    for (const email of normalized) {
      const candidates = byEmail.get(email) ?? [];
      const recipient =
        candidates.find((candidate) => candidate.organizationId === scope.organizationId) ??
        candidates[0];
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
        const byConversation = new Map<string, typeof names>();
        for (const participant of names) {
          const group = byConversation.get(participant.conversationId) ?? [];
          group.push(participant);
          byConversation.set(participant.conversationId, group);
        }
        return rows.map((row) => ({
          ...row,
          partner: (byConversation.get(row.id) ?? []).some(
            (participant) => participant.organizationId !== scope.organizationId,
          ),
          name:
            row.name ??
            ((byConversation.get(row.id) ?? [])
              .filter((participant) => participant.userId !== scope.userId)
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
      if (scope.actorEntityId) throw new AccessDeniedError();
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
    async listAvailableAgents() {
      if (scope.actorEntityId) throw new AccessDeniedError();
      return db.transaction(async (tx) => {
        await authenticate(tx);
        return (await ensureOwnedAgentActors(tx, scope)).map((actor) => ({
          id: actor.entityId,
          name: actor.name,
        }));
      });
    },
    async addMembers(conversationId: string, emails: string[], agentActorIds: string[] = []) {
      if (scope.actorEntityId) throw new AccessDeniedError();
      return db.transaction(async (tx) => {
        await authenticate(tx);
        const conversation = await requireConversation(tx, conversationId);
        if (conversation.kind === "dm" || conversation.createdBy !== scope.userId)
          throw new AccessDeniedError();
        if (agentActorIds.length > 30) throw new ValidationError("At most 30 agents are allowed.");
        let agentsAdded = 0;
        for (const actorId of new Set(agentActorIds)) {
          await new RepositoryContext(tx, {
            organizationId: scope.organizationId,
            actorEntityId: actorId,
          }).requireActiveActor();
          const [agent] = await tx
            .select({ id: actors.entityId })
            .from(actors)
            .innerJoin(userAgents, eq(userAgents.id, actors.userAgentId))
            .where(
              and(
                eq(actors.entityId, actorId),
                eq(actors.organizationId, scope.organizationId),
                eq(actors.type, "agent"),
                eq(userAgents.userId, scope.userId),
              ),
            );
          if (!agent || conversation.organizationId !== scope.organizationId)
            throw new AccessDeniedError();
          const added = await tx
            .insert(agentParticipants)
            .values({
              conversationId,
              organizationId: scope.organizationId,
              actorEntityId: actorId,
            })
            .onConflictDoNothing()
            .returning();
          agentsAdded += added.length;
        }
        const selected = await recipients(tx, emails);
        if (!selected.length) return { added: agentsAdded };
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
        return { added: added.length + agentsAdded };
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
          .select({
            message: messages,
            authorName: sql<string>`case when ${actors.type} = 'agent' then ${actors.name} else ${user.name} end`,
            authorType: sql<"human" | "agent">`coalesce(${actors.type}, 'human')`,
            authorExternal: sql<boolean>`coalesce(${actors.type}, 'human') <> 'agent' AND not exists (
              select 1 from ${member}
              where ${member.userId} = ${messages.authorId}
                and ${member.organizationId} = ${scope.organizationId}
            )`,
          })
          .from(messages)
          .leftJoin(user, eq(user.id, messages.authorId))
          .leftJoin(actors, eq(actors.entityId, messages.authorActorEntityId))
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
        const summaries = await messageSummaries(
          tx,
          scope.userId,
          conversationId,
          rows.map((row) => row.message),
        );
        return rows.map(({ message, authorName, authorExternal, authorType }) => ({
          ...message,
          authorName,
          authorExternal,
          authorType,
          ...summaries.get(message.id)!,
        }));
      });
    },
    async sendMessage(conversationId: string, body: string, threadId?: string, requestId?: string) {
      return db.transaction(async (tx) => {
        const { actor, authorName } = await authenticate(tx);
        const conversation = await requireConversation(tx, conversationId);
        if (!body.trim() || body.length > 20000)
          throw new ValidationError("Message must contain 1 to 20000 characters.");
        if (requestId) {
          const [existing] = await tx
            .select()
            .from(messages)
            .where(
              and(
                eq(messages.authorActorEntityId, actor.entityId),
                eq(messages.requestId, requestId),
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
            return { ...existing, authorName, authorType: actor.type, reactions, replyCount: 0 };
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
          .values({
            conversationId,
            authorId: scope.actorEntityId ? null : scope.userId,
            authorActorEntityId: actor.entityId,
            authorOrganizationId: scope.organizationId,
            body,
            threadId,
            requestId,
          })
          .returning();
        await applyMessageEffects(
          new RepositoryContext(tx, {
            organizationId: scope.organizationId,
            actorEntityId: actor.entityId,
          }),
          scope,
          message!,
          conversation.organizationId,
        );
        const initialReactions: { emoji: string; count: number; reacted: boolean }[] = [];
        return {
          ...message!,
          authorName,
          authorType: actor.type,
          replyCount: 0,
          reactions: initialReactions,
        };
      });
    },
    async toggleReaction(messageId: string, emoji: string) {
      if (scope.actorEntityId) throw new AccessDeniedError();
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
