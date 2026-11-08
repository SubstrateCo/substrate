import type { DatabaseExecutor } from "../../client";
import { ensureHumanActor, ensureUserAgentActor } from "../../core/actors/provisioning";
import { actors } from "../../core/actors/schema";
import { userAgents } from "../../core/actors/user-agents.schema";
import { user } from "../../core/authentication/schema";
import { isOrganizationAdmin } from "../../core/organizations/roles";
import { member } from "../../core/organizations/schema";
import type { RepositoryContext } from "../../core/repository-context";
import { AccessDeniedError, ConflictError, ValidationError } from "../../errors";
import { queueAgentTriggers } from "../agent-runs/triggers";
import { workspaceContext } from "../context/access";
import { applyMessageEffects } from "../context/message-effects";
import { messageEntityReferences } from "../context/schema";
import { conversationRemovalHints } from "../realtime/routing";
import { visibleConversations, type MessagingIdentity } from "./access";
import { messageAuthorColumns } from "./message-authors";
import { messageSummaries } from "./message-summaries";
import { messagingProfile } from "./profiles";
import {
  messagingConversations,
  messagingMessages,
  messagingParticipants,
  messagingReactions,
} from "./schema";
import {
  and,
  asc,
  countDistinct,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  ne,
  or,
  sql,
} from "drizzle-orm";

export interface CreateConversationInput {
  kind: "dm" | "group" | "channel";
  name?: string;
  private?: boolean;
  emails?: string[];
  /** The caller's own agent definitions. */
  agentIds?: string[];
}

async function lockConversation(tx: DatabaseExecutor, scope: MessagingIdentity, id: string) {
  const [conversation] = await tx
    .select()
    .from(messagingConversations)
    .where(and(eq(messagingConversations.id, id), visibleConversations(tx, scope)))
    .for("update");
  if (!conversation) throw new AccessDeniedError();
  return conversation;
}

type MemberActor = { entityId: string; type: "human" | "agent" };

// Adds or restores members. Rows of members who left stay for authorship and come back here.
async function upsertMembers(
  tx: DatabaseExecutor,
  conversationId: string,
  members: (MemberActor & { organizationId: string })[],
) {
  if (!members.length) return [];
  return tx
    .insert(messagingParticipants)
    .values(
      members.map((member) => ({
        conversationId,
        organizationId: member.organizationId,
        actorEntityId: member.entityId,
        actorType: member.type,
      })),
    )
    .onConflictDoUpdate({
      target: [messagingParticipants.conversationId, messagingParticipants.actorEntityId],
      set: { leftAt: null },
      setWhere: isNotNull(messagingParticipants.leftAt),
    })
    .returning();
}

// Posting rejoins a public channel the person left. Private conversations are not visible
// after leaving, so the caller's access check fails first.
async function joinConversation(
  tx: DatabaseExecutor,
  scope: MessagingIdentity,
  actor: MemberActor,
  conversationId: string,
) {
  await upsertMembers(tx, conversationId, [{ ...actor, organizationId: scope.organizationId }]);
}

// An agent writes with its owner's access. Posting records authorship, which the message foreign
// key requires, but never changes membership: only its owner adds or removes it.
async function recordAgentAuthor(
  tx: DatabaseExecutor,
  scope: MessagingIdentity,
  actorEntityId: string,
  conversationId: string,
) {
  await tx
    .insert(messagingParticipants)
    .values({
      conversationId,
      organizationId: scope.organizationId,
      actorEntityId,
      actorType: "agent",
      leftAt: new Date(),
    })
    .onConflictDoNothing();
}

// `agentId` names the agent definition only for its owner, the viewer. Other agents stay private.
async function activeMembers(tx: DatabaseExecutor, conversationIds: string[], viewerId = "") {
  const rows = conversationIds.length
    ? await tx
        .select({
          conversationId: messagingParticipants.conversationId,
          actorId: actors.entityId,
          type: actors.type,
          userId: actors.userId,
          agentId: sql<string | null>`(select ${userAgents.id} from ${userAgents}
            where ${userAgents.id} = ${actors.userAgentId} and ${userAgents.userId} = ${viewerId})`,
          name: sql<string>`coalesce(${user.name}, ${actors.name})`,
          organizationId: messagingParticipants.organizationId,
        })
        .from(messagingParticipants)
        .innerJoin(actors, eq(actors.entityId, messagingParticipants.actorEntityId))
        .leftJoin(user, eq(user.id, actors.userId))
        .where(
          and(
            inArray(messagingParticipants.conversationId, conversationIds),
            isNull(messagingParticipants.leftAt),
          ),
        )
        .orderBy(
          asc(actors.type),
          sql`coalesce(${user.name}, ${actors.name})`,
          asc(actors.entityId),
        )
    : [];
  const byConversation = new Map<string, typeof rows>();
  for (const row of rows) {
    const group = byConversation.get(row.conversationId) ?? [];
    group.push(row);
    byConversation.set(row.conversationId, group);
  }
  return byConversation;
}

// The new owner must be a current member with a verified account and live membership.
async function setOwner(
  tx: DatabaseExecutor,
  conversation: typeof messagingConversations.$inferSelect,
  userId: string,
) {
  const [candidate] = await tx
    .select({ userId: user.id })
    .from(messagingParticipants)
    .innerJoin(actors, eq(actors.entityId, messagingParticipants.actorEntityId))
    .innerJoin(user, and(eq(user.id, actors.userId), eq(user.emailVerified, true)))
    .innerJoin(
      member,
      and(
        eq(member.userId, user.id),
        eq(member.organizationId, messagingParticipants.organizationId),
      ),
    )
    .where(
      and(
        eq(messagingParticipants.conversationId, conversation.id),
        eq(actors.userId, userId),
        isNull(messagingParticipants.leftAt),
      ),
    );
  if (!candidate) throw new ValidationError("The new owner must be a current member.");
  await tx
    .update(messagingConversations)
    .set({ createdBy: userId })
    .where(eq(messagingConversations.id, conversation.id));
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
  message: { conversationId: string; body: string; threadId?: string; requestId?: string },
) {
  const { db: tx } = ctx;
  const { actor, authorName } = author;
  const { conversationId, body, threadId, requestId } = message;
  const conversation = await lockConversation(tx, scope, conversationId);
  if (!body.trim() || body.length > 20000)
    throw new ValidationError("Message must contain 1 to 20000 characters.");
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
        agentRunsQueued: 0,
      };
    }
  }
  if (threadId) await requireThreadRoot(tx, conversationId, threadId);
  if (actor.type === "agent") await recordAgentAuthor(tx, scope, actor.entityId, conversationId);
  else await joinConversation(tx, scope, actor, conversationId);
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
    })
    .returning();
  await applyMessageEffects(ctx, scope, created!, conversation.organizationId);
  const agentRunsQueued = await queueAgentTriggers(tx, scope, created!, conversation.kind);
  const initialReactions: { emoji: string; count: number; reacted: boolean }[] = [];
  return {
    ...created!,
    authorName,
    authorType: actor.type,
    replyCount: 0,
    reactions: initialReactions,
    agentRunsQueued,
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
    const { context, actor, userName } = await workspaceContext(tx, scope);
    return { context, actor, authorName: actor.type === "agent" ? actor.name : userName };
  }

  const requireConversation = (tx: DatabaseExecutor, id: string) => lockConversation(tx, scope, id);

  // Owners manage their conversation. Owners and admins of the owning organization manage any of
  // its conversations except 1:1 DMs, without gaining read access. Agents never manage.
  async function requireManaged(tx: DatabaseExecutor, id: string) {
    if (scope.actorEntityId) throw new AccessDeniedError();
    const admin = await isOrganizationAdmin(tx, scope.userId, scope.organizationId);
    const [conversation] = await tx
      .select()
      .from(messagingConversations)
      .where(
        and(
          eq(messagingConversations.id, id),
          admin
            ? or(
                visibleConversations(tx, scope),
                eq(messagingConversations.organizationId, scope.organizationId),
              )
            : visibleConversations(tx, scope),
        ),
      )
      .for("update");
    if (!conversation || conversation.kind === "dm") throw new AccessDeniedError();
    const owner = conversation.createdBy === scope.userId;
    if (!owner && !(admin && conversation.organizationId === scope.organizationId))
      throw new AccessDeniedError();
    return conversation;
  }

  function normalizeEmail(email: string) {
    const normalized = email.trim().toLowerCase();
    if (!normalized || !normalized.includes("@"))
      throw new ValidationError("An exact email address is required.");
    return normalized;
  }

  async function recipients(tx: DatabaseExecutor, emails: string[]) {
    if (emails.length > 100) throw new ValidationError("At most 100 recipients are allowed.");
    const normalized = [...new Set(emails.map(normalizeEmail))];
    if (!normalized.length) return [];
    const matches = await tx
      .select({
        userId: user.id,
        name: user.name,
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
    const result = new Map<string, { userId: string; name: string; organizationId: string }>();
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
    // Each person joins through their human actor in the organization that matched.
    const people = [];
    for (const recipient of result.values()) {
      const actor = await ensureHumanActor(tx, recipient);
      people.push({ entityId: actor.entityId, type: "human" as const, ...recipient });
    }
    return people;
  }

  // Only the owner can add their agent, and only an enabled agent of this organization.
  async function ownedAgents(tx: DatabaseExecutor, agentIds: string[]) {
    if (agentIds.length > 20) throw new ValidationError("At most 20 agents are allowed.");
    const result = [];
    for (const userAgentId of new Set(agentIds)) {
      const actor = await ensureUserAgentActor(tx, {
        organizationId: scope.organizationId,
        userId: scope.userId,
        userAgentId,
      });
      result.push({
        entityId: actor.entityId,
        type: "agent" as const,
        organizationId: scope.organizationId,
      });
    }
    return result;
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
        await authenticate(tx);
        const rows = await tx
          .select()
          .from(messagingConversations)
          .where(visibleConversations(tx, scope))
          .orderBy(asc(messagingConversations.createdAt), asc(messagingConversations.id));
        const ids = rows.map((row) => row.id);
        const byConversation = await activeMembers(tx, ids, scope.userId);
        const admin =
          !scope.actorEntityId &&
          (await isOrganizationAdmin(tx, scope.userId, scope.organizationId));
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
            canManage:
              !scope.actorEntityId &&
              row.kind !== "dm" &&
              (row.createdBy === scope.userId ||
                (admin && row.organizationId === scope.organizationId)),
          };
        });
      });
    },

    async createConversation(input: CreateConversationInput) {
      if (scope.actorEntityId) throw new AccessDeniedError();
      return db.transaction(async (tx) => {
        const { actor } = await authenticate(tx);
        if (!["dm", "group", "channel"].includes(input.kind))
          throw new ValidationError("Invalid conversation kind.");
        const selected = [
          ...(await recipients(tx, input.emails ?? [])),
          ...(await ownedAgents(tx, input.agentIds ?? [])),
        ];
        if (input.kind === "dm" && selected.length !== 1)
          throw new ValidationError("A DM requires exactly one recipient.");
        if (input.kind === "dm") {
          const existing = await existingDirectMessage(tx, [actor.entityId, selected[0]!.entityId]);
          if (existing) return existing;
        }
        if (input.kind === "group" && selected.length < 2)
          throw new ValidationError("A group DM requires at least two recipients.");
        const name = input.name?.trim() || null;
        if (input.kind === "channel" && !name)
          throw new ValidationError("Channels require a name.");
        const [conversation] = await tx
          .insert(messagingConversations)
          .values({
            organizationId: scope.organizationId,
            createdBy: scope.userId,
            kind: input.kind,
            name,
            private: input.kind === "channel" ? (input.private ?? false) : true,
          })
          .returning();
        await upsertMembers(tx, conversation!.id, [
          { ...actor, organizationId: scope.organizationId },
          ...selected,
        ]);
        return conversation!;
      });
    },

    async addMembers(conversationId: string, emails: string[]) {
      if (scope.actorEntityId) throw new AccessDeniedError();
      return db.transaction(async (tx) => {
        await authenticate(tx);
        await requireManaged(tx, conversationId);
        const selected = await recipients(tx, emails);
        // Adding someone who left brings them back.
        const added = await upsertMembers(tx, conversationId, selected);
        return { added: added.length };
      });
    },

    // A member adds their own agent so they can address it here. This is not management:
    // the agent reads with its owner's access, so it gains nothing the owner cannot see.
    async addAgent(conversationId: string, agentId: string) {
      if (scope.actorEntityId) throw new AccessDeniedError();
      return db.transaction(async (tx) => {
        await authenticate(tx);
        const conversation = await requireConversation(tx, conversationId);
        if (conversation.kind === "dm")
          throw new ValidationError("Start a direct conversation with the agent instead.");
        const [agent] = await ownedAgents(tx, [agentId]);
        await upsertMembers(tx, conversationId, [agent!]);
        return { actorId: agent!.entityId };
      });
    },

    // Only the agent's owner removes it. Its rows stay for authorship history.
    async removeAgent(conversationId: string, agentActorId: string) {
      if (scope.actorEntityId) throw new AccessDeniedError();
      return db.transaction(async (tx) => {
        await authenticate(tx);
        const conversation = await requireConversation(tx, conversationId);
        if (conversation.kind === "dm") throw new AccessDeniedError();
        const removed = await tx
          .update(messagingParticipants)
          .set({ leftAt: new Date() })
          .where(
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
          )
          .returning();
        if (!removed.length) throw new AccessDeniedError();
        return { removed: true };
      });
    },

    async joinConversation(conversationId: string) {
      if (scope.actorEntityId) throw new AccessDeniedError();
      return db.transaction(async (tx) => {
        const { actor } = await authenticate(tx);
        await requireConversation(tx, conversationId);
        await joinConversation(tx, scope, actor, conversationId);
        return { joined: true };
      });
    },

    // The owner names a new owner in the same call. The last member deletes instead.
    async leaveConversation(conversationId: string, newOwnerUserId?: string) {
      if (scope.actorEntityId) throw new AccessDeniedError();
      return db.transaction(async (tx) => {
        const { actor } = await authenticate(tx);
        const conversation = await requireConversation(tx, conversationId);
        if (conversation.kind === "dm") throw new AccessDeniedError();
        if (conversation.createdBy === scope.userId) {
          if (newOwnerUserId && newOwnerUserId !== scope.userId)
            await setOwner(tx, conversation, newOwnerUserId);
          else {
            const others = (await activeMembers(tx, [conversationId])).get(conversationId) ?? [];
            // Agents cannot own conversations, so only people count here.
            throw new ConflictError(
              others.some((person) => person.userId && person.userId !== scope.userId)
                ? "Choose a new owner before leaving."
                : "You are the last member. Delete the conversation instead.",
            );
          }
        }
        // A public channel member may never have posted, so the row may not exist yet.
        await tx
          .insert(messagingParticipants)
          .values({
            conversationId,
            organizationId: scope.organizationId,
            actorEntityId: actor.entityId,
            actorType: actor.type,
            leftAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [messagingParticipants.conversationId, messagingParticipants.actorEntityId],
            set: { leftAt: new Date() },
          });
        return { left: true };
      });
    },

    async transferOwnership(conversationId: string, userId: string) {
      return db.transaction(async (tx) => {
        await authenticate(tx);
        const conversation = await requireManaged(tx, conversationId);
        await setOwner(tx, conversation, userId);
        return { ownerUserId: userId };
      });
    },

    // Counts only linked work the caller can read, so the warning leaks nothing.
    async deleteImpact(conversationId: string) {
      return db.transaction(async (tx) => {
        const { context } = await authenticate(tx);
        await requireManaged(tx, conversationId);
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
        await authenticate(tx);
        const conversation = await requireManaged(tx, conversationId);
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
        await authenticate(tx);
        if (!(await isOrganizationAdmin(tx, scope.userId, scope.organizationId)))
          throw new AccessDeniedError();
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
        await requireConversation(tx, conversationId);
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
          .select({ message: messagingMessages, ...messageAuthorColumns(scope.organizationId) })
          .from(messagingMessages)
          .leftJoin(user, eq(user.id, messagingMessages.authorId))
          .leftJoin(actors, eq(actors.entityId, messagingMessages.authorActorEntityId))
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
        return rows.map(({ message, authorName, authorExternal, authorType }) => ({
          ...message,
          authorName,
          authorExternal,
          authorType,
          ...summaries.get(message.id)!,
        }));
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
        if (!emoji.trim() || emoji.length > 64)
          throw new ValidationError("Reaction must contain 1 to 64 characters.");
        const [message] = await tx
          .select()
          .from(messagingMessages)
          .where(eq(messagingMessages.id, messageId));
        if (!message) throw new AccessDeniedError();
        await requireConversation(tx, message.conversationId);
        await joinConversation(tx, scope, actor, message.conversationId);
        const key = and(
          eq(messagingReactions.messageId, messageId),
          eq(messagingReactions.actorEntityId, actor.entityId),
          eq(messagingReactions.emoji, emoji),
        );
        const removed = await tx.delete(messagingReactions).where(key).returning();
        if (removed.length) return { active: false };
        await tx.insert(messagingReactions).values({
          conversationId: message.conversationId,
          messageId,
          actorEntityId: actor.entityId,
          emoji,
        });
        return { active: true };
      });
    },
  };
}
