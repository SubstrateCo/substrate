import type { DatabaseExecutor } from "../../client";
import { actors } from "../../core/actors/schema";
import { userAgents } from "../../core/actors/user-agents.schema";
import { user } from "../../core/authentication/schema";
import type { RepositoryContext } from "../../core/repository-context";
import { AccessDeniedError, ConflictError, ValidationError } from "../../errors";
import { routeWake } from "../agent-work/router";
import { workspaceContext } from "../context/access";
import { applyMessageEffects } from "../context/message-effects";
import { messageEntityReferences } from "../context/schema";
import { conversationRemovalHints, messageChangeHints } from "../realtime/routing";
import {
  approvedParticipant,
  loadConversation,
  visibleConversations,
  type MessagingIdentity,
} from "./access";
import { activeMembers, endParticipation, hasOtherPerson, setOwner, writeMembers } from "./members";
import { messageAuthorColumns } from "./message-authors";
import { messageSummaries } from "./message-summaries";
import {
  canManage,
  canShare,
  leaveBlocked,
  leavePlan,
  validateBody,
  validateCreate,
  validateEmoji,
  validateExternalInvitations,
  viewerOf,
  type Viewer,
} from "./policy";
import { messagingProfile } from "./profiles";
import { ownedAgents, recipients } from "./recipients";
import {
  messagingConversations,
  messagingMessages,
  messagingParticipants,
  messagingReactions,
} from "./schema";
import { queueSharingInvitation } from "./sharing";
import { messagingInvitations } from "./sharing.schema";
import { and, asc, countDistinct, desc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";

interface CreateConversationInput {
  kind: "dm" | "group" | "channel";
  name?: string;
  private?: boolean;
  emails?: string[];
  shareHistory?: boolean;
  /** The caller's own agent definitions. */
  agentIds?: string[];
}

async function requireThreadRoot(tx: DatabaseExecutor, conversationId: string, threadId: string) {
  const [root] = await tx
    .select({ id: messagingMessages.id })
    .from(messagingMessages)
    .where(
      and(
        eq(messagingMessages.conversationId, conversationId),
        eq(messagingMessages.id, threadId),
        isNull(messagingMessages.threadId),
      ),
    );
  if (!root) throw new ValidationError("Thread must be a root message in this conversation.");
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
      authorId: scope.actorEntityId ? null : scope.userId,
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
    const { context, actor, userName, admin } = await workspaceContext(tx, scope);
    return {
      context,
      actor,
      authorName: actor.type === "agent" ? actor.name : userName,
      viewer: viewerOf(scope, admin),
    };
  }

  // Admins can find conversations of their organization that they cannot read.
  async function requireManaged(tx: DatabaseExecutor, viewer: Viewer, id: string) {
    if (viewer.agent) throw new AccessDeniedError();
    const [conversation] = await tx
      .select()
      .from(messagingConversations)
      .where(
        and(
          eq(messagingConversations.id, id),
          viewer.admin
            ? or(
                visibleConversations(tx, scope),
                eq(messagingConversations.organizationId, scope.organizationId),
              )
            : visibleConversations(tx, scope),
        ),
      )
      .for("update");
    if (!conversation || !canManage(conversation, viewer)) throw new AccessDeniedError();
    return conversation;
  }

  // A pair has one DM per organization. The lock serializes concurrent starts by either person,
  // so the lookup and the insert that follows act as one step.
  async function existingDirectMessage(tx: DatabaseExecutor, actorIds: [string, string]) {
    const key = `messaging-dm:${scope.organizationId}:${[...actorIds].sort().join(":")}`;
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
    const member = (actorEntityId: string) =>
      inArray(
        messagingConversations.id,
        tx
          .select({ id: messagingParticipants.conversationId })
          .from(messagingParticipants)
          .where(eq(messagingParticipants.actorEntityId, actorEntityId)),
      );
    const [existing] = await tx
      .select()
      .from(messagingConversations)
      .where(
        and(
          eq(messagingConversations.kind, "dm"),
          eq(messagingConversations.organizationId, scope.organizationId),
          member(actorIds[0]),
          member(actorIds[1]),
        ),
      )
      .orderBy(desc(messagingConversations.createdAt))
      .limit(1);
    return existing;
  }

  return {
    async listConversations() {
      return db.transaction(async (tx) => {
        const { viewer } = await authenticate(tx);
        const rows = await tx
          .select()
          .from(messagingConversations)
          .where(visibleConversations(tx, scope))
          .orderBy(asc(messagingConversations.createdAt), asc(messagingConversations.id));
        const ids = rows.map((row) => row.id);
        const byConversation = await activeMembers(tx, ids, scope.userId);
        return rows.map((row) => {
          const members = byConversation.get(row.id) ?? [];
          return {
            ...row,
            partner: members.some(
              (participant) => participant.organizationId !== scope.organizationId,
            ),
            name:
              row.name ??
              (members
                .filter((participant) => participant.userId !== scope.userId)
                .map((participant) => participant.name)
                .join(", ") ||
                null),
            members: members.map(({ actorId, type, userId, agentId, name }) => ({
              actorId,
              type,
              userId,
              agentId,
              name,
            })),
            // The sidebar lists joined conversations. Public channels the person never joined or
            // left are still returned, so links and search can open them.
            joined: members.some((participant) => participant.userId === scope.userId),
            // Listed rows are visible, and a visible partner row has an active connection.
            canShare: canShare(row, viewer, { connected: true, visible: true }),
            canManage: canManage(row, viewer),
          };
        });
      });
    },

    async createConversation(input: CreateConversationInput) {
      if (scope.actorEntityId) throw new AccessDeniedError();
      return db.transaction(async (tx) => {
        const { actor, viewer } = await authenticate(tx);
        const { people, external } = await recipients(tx, scope, input.emails ?? []);
        const selected = [...people, ...(await ownedAgents(tx, scope, input.agentIds ?? []))];
        const values = validateCreate(input, selected.length + external.length);
        if (input.kind === "dm" && external.length) {
          const email = external[0]!;
          await tx.execute(
            sql`select pg_advisory_xact_lock(hashtextextended(${`messaging-dm-email:${scope.organizationId}:${scope.userId}:${email}`}, 0))`,
          );
          const [existing] = await tx
            .select({ conversation: messagingConversations })
            .from(messagingConversations)
            .leftJoin(
              messagingParticipants,
              eq(messagingParticipants.conversationId, messagingConversations.id),
            )
            .leftJoin(actors, eq(actors.entityId, messagingParticipants.actorEntityId))
            .leftJoin(user, eq(user.id, actors.userId))
            .where(
              and(
                eq(messagingConversations.kind, "dm"),
                eq(messagingConversations.organizationId, scope.organizationId),
                eq(messagingConversations.createdBy, scope.userId),
                or(
                  and(
                    eq(sql`lower(${user.email})`, email),
                    isNull(messagingParticipants.leftAt),
                    approvedParticipant(tx),
                  ),
                  inArray(
                    messagingConversations.id,
                    tx
                      .select({ id: messagingInvitations.conversationId })
                      .from(messagingInvitations)
                      .where(
                        and(
                          eq(messagingInvitations.email, email),
                          eq(messagingInvitations.status, "pending"),
                          sql`${messagingInvitations.expiresAt} > now()`,
                        ),
                      ),
                  ),
                ),
              ),
            )
            .limit(1);
          if (existing) return existing.conversation;
        }
        if (input.kind === "dm" && !external.length) {
          const existing = await existingDirectMessage(tx, [actor.entityId, selected[0]!.entityId]);
          if (existing) return existing;
        }
        // An existing DM is returned above without a new invitation, so this checks only new ones.
        validateExternalInvitations(input, viewer, {
          count: external.length,
          shareHistory: input.shareHistory === true,
        });
        const [conversation] = await tx
          .insert(messagingConversations)
          .values({
            organizationId: scope.organizationId,
            createdBy: scope.userId,
            kind: input.kind,
            ...values,
          })
          .returning();
        await writeMembers(
          tx,
          conversation!.id,
          [{ ...actor, organizationId: scope.organizationId }, ...selected],
          "join",
        );
        for (const email of external)
          await queueSharingInvitation(
            tx,
            scope,
            conversation!,
            email,
            input.shareHistory === true,
          );
        return conversation!;
      });
    },

    async addMembers(conversationId: string, emails: string[], shareHistory = false) {
      if (scope.actorEntityId) throw new AccessDeniedError();
      return db.transaction(async (tx) => {
        const { viewer } = await authenticate(tx);
        const conversation = await requireManaged(tx, viewer, conversationId);
        const { people: selected, external } = await recipients(tx, scope, emails);
        validateExternalInvitations(conversation, viewer, {
          count: external.length,
          shareHistory,
        });
        for (const email of external)
          await queueSharingInvitation(tx, scope, conversation, email, shareHistory);
        // Adding someone who left brings them back.
        const added = await writeMembers(tx, conversationId, selected, "join");
        if (external.length) return { added: added.length, invited: external.length };
        return { added: added.length };
      });
    },

    // A member adds their own agent so they can address it here. This is not management:
    // the agent reads with its owner's access, so it gains nothing the owner cannot see.
    async addAgent(conversationId: string, agentId: string) {
      if (scope.actorEntityId) throw new AccessDeniedError();
      return db.transaction(async (tx) => {
        await authenticate(tx);
        const conversation = await loadConversation(tx, scope, conversationId, "update");
        if (conversation.kind === "dm")
          throw new ValidationError("Start a direct conversation with the agent instead.");
        const [agent] = await ownedAgents(tx, scope, [agentId]);
        await writeMembers(tx, conversationId, [agent!], "join");
        return { actorId: agent!.entityId };
      });
    },

    // Only the agent's owner removes it. Its rows stay for authorship history.
    async removeAgent(conversationId: string, agentActorId: string) {
      if (scope.actorEntityId) throw new AccessDeniedError();
      return db.transaction(async (tx) => {
        await authenticate(tx);
        const conversation = await loadConversation(tx, scope, conversationId, "update");
        if (conversation.kind === "dm") throw new AccessDeniedError();
        const removed = await endParticipation(
          tx,
          and(
            eq(messagingParticipants.conversationId, conversationId),
            eq(messagingParticipants.actorEntityId, agentActorId),
            eq(messagingParticipants.actorType, "agent"),
            isNull(messagingParticipants.leftAt),
            inArray(
              messagingParticipants.actorEntityId,
              tx
                .select({ id: actors.entityId })
                .from(actors)
                .innerJoin(userAgents, eq(userAgents.id, actors.userAgentId))
                .where(eq(userAgents.userId, scope.userId)),
            ),
          ),
        ).returning();
        if (!removed.length) throw new AccessDeniedError();
        return { removed: true };
      });
    },

    async joinConversation(conversationId: string) {
      if (scope.actorEntityId) throw new AccessDeniedError();
      return db.transaction(async (tx) => {
        const { actor } = await authenticate(tx);
        await loadConversation(tx, scope, conversationId, "update");
        const changed =
          (
            await writeMembers(
              tx,
              conversationId,
              [{ ...actor, organizationId: scope.organizationId }],
              "join",
            )
          ).length > 0;
        return { joined: true, changed };
      });
    },

    // The owner names a new owner in the same call. The last member deletes instead.
    async leaveConversation(conversationId: string, newOwnerUserId?: string) {
      if (scope.actorEntityId) throw new AccessDeniedError();
      return db.transaction(async (tx) => {
        const { actor, viewer } = await authenticate(tx);
        const conversation = await loadConversation(tx, scope, conversationId, "update");
        const plan = leavePlan(conversation, viewer, newOwnerUserId);
        if (plan === "transfer") await setOwner(tx, conversation, newOwnerUserId!);
        if (plan === "blocked")
          throw leaveBlocked(await hasOtherPerson(tx, conversationId, scope.userId));
        await writeMembers(
          tx,
          conversationId,
          [{ ...actor, organizationId: scope.organizationId }],
          "leave",
        );
        return { left: true };
      });
    },

    async transferOwnership(conversationId: string, userId: string) {
      return db.transaction(async (tx) => {
        const { viewer } = await authenticate(tx);
        const conversation = await requireManaged(tx, viewer, conversationId);
        await setOwner(tx, conversation, userId);
        return { ownerUserId: userId };
      });
    },

    // Counts only linked work the caller can read, so the warning leaks nothing.
    async deleteImpact(conversationId: string) {
      return db.transaction(async (tx) => {
        const { context, viewer } = await authenticate(tx);
        await requireManaged(tx, viewer, conversationId);
        const [row] = await tx
          .select({ linkedWork: countDistinct(messageEntityReferences.entityId) })
          .from(messageEntityReferences)
          .where(
            and(
              eq(messageEntityReferences.conversationId, conversationId),
              inArray(messageEntityReferences.entityId, context.readableEntities()),
            ),
          );
        return { linkedWork: row?.linkedWork ?? 0 };
      });
    },

    // Foreign keys remove messages, members, reactions, references and alerts. Task history keeps
    // its rows without the message link. Hints are collected first because the rows go away.
    async deleteConversation(conversationId: string) {
      return db.transaction(async (tx) => {
        const { viewer } = await authenticate(tx);
        const conversation = await requireManaged(tx, viewer, conversationId);
        const hints = await conversationRemovalHints(tx, conversation);
        await tx
          .delete(messagingConversations)
          .where(eq(messagingConversations.id, conversationId));
        return { hints };
      });
    },

    // Admin view: names and members only, never messages.
    async listManagedConversations() {
      if (scope.actorEntityId) throw new AccessDeniedError();
      return db.transaction(async (tx) => {
        const { viewer } = await authenticate(tx);
        if (!viewer.admin) throw new AccessDeniedError();
        const rows = await tx
          .select({
            id: messagingConversations.id,
            kind: messagingConversations.kind,
            name: messagingConversations.name,
            private: messagingConversations.private,
            createdAt: messagingConversations.createdAt,
            ownerUserId: messagingConversations.createdBy,
            ownerName: user.name,
          })
          .from(messagingConversations)
          .innerJoin(user, eq(user.id, messagingConversations.createdBy))
          .where(
            and(
              eq(messagingConversations.organizationId, scope.organizationId),
              ne(messagingConversations.kind, "dm"),
            ),
          )
          .orderBy(asc(messagingConversations.createdAt), asc(messagingConversations.id));
        const byConversation = await activeMembers(
          tx,
          rows.map((row) => row.id),
        );
        return rows.map((row) => {
          const members = (byConversation.get(row.id) ?? []).map(
            ({ actorId, type, userId, name }) => ({ actorId, type, userId, name }),
          );
          return {
            ...row,
            name: row.name ?? (members.map((person) => person.name).join(", ") || null),
            members,
          };
        });
      });
    },
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
          .leftJoin(user, eq(user.id, messagingMessages.authorId))
          .leftJoin(actors, eq(actors.entityId, messagingMessages.authorActorEntityId))
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
          .select()
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
