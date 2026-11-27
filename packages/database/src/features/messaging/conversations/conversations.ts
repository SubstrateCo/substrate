import { isDirectConversation, type ConversationKind } from "@substrate/contracts/messaging/input";
import { realtimeKeys } from "@substrate/contracts/realtime";

import { actors } from "../../../core/actors/schema";
import { userAgents } from "../../../core/actors/user-agents.schema";
import { user } from "../../../core/authentication/schema";
import { effectsFor } from "../../../core/effects";
import type { DatabaseExecutor } from "../../../core/executor";
import { member, organization } from "../../../core/organizations/schema";
import type { SessionIdentity } from "../../../core/session/identity";
import type { MessagingReader, MessagingSessionResolver } from "../../../core/session/messaging";
import { AccessDeniedError, ValidationError } from "../../../errors";
import { messageEntityReferences } from "../../context/schema";
import { inArchivedProject } from "../../projects/archive";
import { withRemovalHints } from "../../realtime/routing";
import { tasks } from "../../tasks/tasks.schema";
import {
  claimConversationChange,
  loadConversation,
  visibleConversations,
  type Conversation,
} from "../access";
import {
  canManage,
  canShare,
  leaveBlocked,
  leavePlan,
  validateCreate,
  type Viewer,
} from "../policy";
import { messagingConversations, messagingParticipants } from "../schema";
import { messagingConnections } from "../sharing.schema";
import { queueSharingInvitations } from "../sharing/invitations";
import {
  directMessageKey,
  externalDirectMessageKey,
  findExternalDirectMessage,
} from "./direct-messages";
import { activeMembers, endParticipation, hasOtherPerson, setOwner, writeMembers } from "./members";
import { ownedAgents, recipients } from "./recipients";
import { and, asc, countDistinct, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";

interface CreateConversationInput {
  kind: ConversationKind;
  name?: string;
  private?: boolean;
  emails?: string[];
  shareHistory?: boolean;
  /** The caller's own agent definitions. */
  agentIds?: string[];
}

// An unnamed conversation is named after the given members.
function displayName(name: string | null, members: { name: string }[]) {
  return name ?? (members.map((person) => person.name).join(", ") || null);
}

// The client view of a conversation. The DM key holds organization, actor and invited email IDs.
function conversationView(conversation: Conversation) {
  const { id, organizationId, kind, taskEntityId, name, createdBy, createdAt } = conversation;
  return {
    id,
    organizationId,
    kind,
    taskEntityId,
    name,
    private: conversation.private,
    createdBy,
    createdAt,
  };
}

// Conversation membership and management. Scope comes from the authenticated session.
export function conversationOperations(
  db: DatabaseExecutor,
  scope: Readonly<SessionIdentity>,
  authenticate: MessagingSessionResolver,
  read: MessagingReader,
) {
  function changed(tx: DatabaseExecutor, conversationId: string, management = false) {
    const effects = effectsFor(tx);
    effects.hint({ audience: realtimeKeys.conversation(conversationId), domain: "messaging" });
    if (management)
      effects.hint({
        audience: realtimeKeys.organization(scope.organizationId),
        domain: "messaging",
      });
  }

  // Admins can find conversations of their organization that they cannot read.
  async function managedConversation(tx: DatabaseExecutor, viewer: Viewer, id: string) {
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
      );
    if (!conversation || !canManage(conversation, viewer)) throw new AccessDeniedError();
    return conversation;
  }

  // Management writes claim the conversation's next version, so they run one at a time. The
  // claim succeeds only when the row is still the one authorized here.
  async function requireManaged(tx: DatabaseExecutor, viewer: Viewer, id: string) {
    return claimConversationChange(tx, await managedConversation(tx, viewer, id));
  }

  return {
    async listConversations(selectedConversationId?: string) {
      return read(async (tx) => {
        const { viewer, context } = await authenticate(tx);
        const rows = await tx
          .select()
          .from(messagingConversations)
          .where(
            and(
              visibleConversations(tx, scope),
              or(
                isNull(messagingConversations.taskEntityId),
                selectedConversationId
                  ? eq(messagingConversations.id, selectedConversationId)
                  : undefined,
              ),
            ),
          )
          .orderBy(asc(messagingConversations.createdAt), asc(messagingConversations.id));
        const ids = rows.map((row) => row.id);
        const taskIds = rows.flatMap((row) => (row.taskEntityId ? [row.taskEntityId] : []));
        const discussions = taskIds.length
          ? await tx
              .select({
                taskEntityId: tasks.entityId,
                projectEntityId: tasks.projectEntityId,
                title: tasks.title,
                canPost: sql<boolean>`(${context.readable(tasks.entityId, "comment")}
                  AND NOT ${inArchivedProject(tasks.organizationId, tasks.entityId)})`,
              })
              .from(tasks)
              .where(inArray(tasks.entityId, taskIds))
          : [];
        const byConversation = await activeMembers(tx, ids, scope);
        // Only disclose organizations attached to conversations this viewer can read.
        const connections = ids.length
          ? await tx
              .select({
                conversationId: messagingConnections.conversationId,
                organizationId: messagingConnections.organizationId,
              })
              .from(messagingConnections)
              .where(
                and(
                  inArray(messagingConnections.conversationId, ids),
                  isNull(messagingConnections.disconnectedAt),
                ),
              )
          : [];
        const organizationIds = [
          ...new Set([
            ...rows.map((row) => row.organizationId),
            ...connections.map((connection) => connection.organizationId),
          ]),
        ];
        const organizations = organizationIds.length
          ? await tx
              .select({ id: organization.id, name: organization.name })
              .from(organization)
              .where(inArray(organization.id, organizationIds))
              .orderBy(asc(organization.name), asc(organization.id))
          : [];
        return rows.map((row) => {
          const discussion = discussions.find((task) => task.taskEntityId === row.taskEntityId);
          const task = discussion
            ? {
                taskEntityId: discussion.taskEntityId,
                projectEntityId: discussion.projectEntityId,
                title: discussion.title,
              }
            : null;
          const members = byConversation.get(row.id) ?? [];
          const connectedIds = new Set(
            connections
              .filter((connection) => connection.conversationId === row.id)
              .map((connection) => connection.organizationId),
          );
          const channelOrganizations = organizations
            .filter((org) => org.id === row.organizationId || connectedIds.has(org.id))
            .map((org) => ({
              ...org,
              host: org.id === row.organizationId,
              own: org.id === scope.organizationId,
            }));
          return {
            ...conversationView(row),
            task,
            canPost: row.taskEntityId ? !!discussion?.canPost : true,
            organizations: channelOrganizations,
            partner: channelOrganizations.some((org) => !org.own),
            name:
              task?.title ??
              displayName(
                row.name,
                members.filter((participant) => participant.userId !== scope.userId),
              ),
            members: members.map(
              ({ actorId, type, userId, agentId, name, image, organizationId }) => ({
                actorId,
                type,
                userId,
                agentId,
                name,
                image,
                organizationId,
                external: organizationId !== scope.organizationId,
              }),
            ),
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
        if (
          input.kind === "agent_dm" &&
          ((input.emails?.length ?? 0) !== 0 || input.agentIds?.length !== 1)
        )
          throw new ValidationError("An agent DM requires exactly one owned agent and no people.");
        if (input.kind === "dm" && input.agentIds?.length)
          throw new ValidationError("Use an agent DM to message your agent.");
        const { people, external } = await recipients(tx, scope, input.emails ?? []);
        const selected = [...people, ...(await ownedAgents(tx, scope, input.agentIds ?? []))];
        const values = validateCreate(input, selected.length + external.length);
        let dmKey: string | null = null;
        if (input.kind === "dm" && external.length) {
          const existing = await findExternalDirectMessage(tx, scope, external[0]!);
          if (existing) return conversationView(existing);
          dmKey = externalDirectMessageKey(scope, external[0]!);
        } else if (isDirectConversation(input.kind))
          dmKey = directMessageKey(
            scope.organizationId,
            [actor.entityId, selected[0]!.entityId],
            input.kind,
          );
        let conversation: typeof messagingConversations.$inferSelect | undefined;
        while (!conversation) {
          [conversation] = await tx
            .insert(messagingConversations)
            .values({
              organizationId: scope.organizationId,
              createdBy: scope.userId,
              kind: input.kind,
              dmKey,
              ...values,
            })
            .onConflictDoNothing()
            .returning();
          if (conversation) break;
          const [existing] = await tx
            .select()
            .from(messagingConversations)
            .where(eq(messagingConversations.dmKey, dmKey!));
          // A deletion or another re-invite can release the key while the insert waits.
          if (!existing) continue;
          if (!external.length) return conversationView(existing);
          // Read validity after the wait: a concurrent creator may just have queued its invite.
          const valid = await findExternalDirectMessage(tx, scope, external[0]!);
          if (valid) return conversationView(valid);
          // Expired/revoked invitations and departed or disconnected people do not reserve a DM.
          // Release the key only if the holder is unchanged since it was read: invitations and
          // acceptances claim a new version. Otherwise the next round reads the holder again.
          await tx
            .update(messagingConversations)
            .set({ dmKey: null, version: sql`${messagingConversations.version} + 1` })
            .where(
              and(
                eq(messagingConversations.id, existing.id),
                eq(messagingConversations.dmKey, dmKey!),
                eq(messagingConversations.version, existing.version),
              ),
            );
        }
        await writeMembers(
          tx,
          conversation!.id,
          [{ ...actor, organizationId: scope.organizationId }, ...selected],
          "join",
        );
        // An existing DM is returned above without a new invitation.
        await queueSharingInvitations(
          tx,
          scope,
          conversation!,
          { emails: external, shareHistory: input.shareHistory === true },
          viewer,
        );
        changed(tx, conversation!.id);
        return conversationView(conversation!);
      });
    },

    async addMembers(conversationId: string, emails: string[], shareHistory = false) {
      if (scope.actorEntityId) throw new AccessDeniedError();
      return db.transaction(async (tx) => {
        const { viewer } = await authenticate(tx);
        const conversation = await requireManaged(tx, viewer, conversationId);
        const { people: selected, external } = await recipients(tx, scope, emails);
        await queueSharingInvitations(
          tx,
          scope,
          conversation,
          { emails: external, shareHistory },
          viewer,
        );
        // Adding someone who left brings them back.
        const added = await writeMembers(tx, conversationId, selected, "join");
        if (added.length || external.length) changed(tx, conversationId, true);
        if (external.length) return { added: added.length, invited: external.length };
        return { added: added.length };
      });
    },

    async removeMember(conversationId: string, actorId: string) {
      if (scope.actorEntityId) throw new AccessDeniedError();
      return db.transaction(async (tx) => {
        const { actor, viewer } = await authenticate(tx);
        const conversation = await requireManaged(tx, viewer, conversationId);
        if (isDirectConversation(conversation.kind) || actorId === actor.entityId)
          throw new AccessDeniedError();
        const [target] = await tx
          .select({ userId: actors.userId })
          .from(messagingParticipants)
          .innerJoin(actors, eq(actors.entityId, messagingParticipants.actorEntityId))
          .innerJoin(
            member,
            and(eq(member.userId, actors.userId), eq(member.organizationId, actors.organizationId)),
          )
          .where(
            and(
              eq(messagingParticipants.conversationId, conversationId),
              eq(messagingParticipants.actorEntityId, actorId),
              eq(messagingParticipants.actorType, "human"),
              eq(messagingParticipants.organizationId, conversation.organizationId),
              isNull(messagingParticipants.leftAt),
            ),
          );
        if (!target || target.userId === conversation.createdBy || target.userId === scope.userId)
          throw new AccessDeniedError();
        const accessRevoked = conversation.kind !== "channel" || conversation.private;
        await endParticipation(
          tx,
          and(
            eq(messagingParticipants.conversationId, conversationId),
            eq(messagingParticipants.actorEntityId, actorId),
          ),
        );
        changed(tx, conversationId, true);
        // Removed members no longer receive conversation hints. A user hint also refreshes
        // their owner's agent sources and clears cached private content after access loss.
        effectsFor(tx).hint({
          audience: realtimeKeys.user(target.userId!),
          domain: accessRevoked ? "access" : "messaging",
        });
        return { removed: true, accessRevoked };
      });
    },

    // A member adds their own agent so they can address it here. This is not management:
    // the agent reads with its owner's access, so it gains nothing the owner cannot see.
    async addAgent(conversationId: string, agentId: string) {
      if (scope.actorEntityId) throw new AccessDeniedError();
      return db.transaction(async (tx) => {
        await authenticate(tx);
        const conversation = await loadConversation(tx, scope, conversationId);
        if (conversation.taskEntityId) throw new AccessDeniedError();
        if (conversation.kind === "agent_dm") throw new AccessDeniedError();
        if (conversation.kind === "dm")
          throw new ValidationError("Start a direct conversation with the agent instead.");
        const [agent] = await ownedAgents(tx, scope, [agentId]);
        const added = await writeMembers(tx, conversationId, [agent!], "join");
        if (added.length) changed(tx, conversationId);
        return { actorId: agent!.entityId };
      });
    },

    // Only the agent's owner removes it. Its rows stay for authorship history.
    async removeAgent(conversationId: string, agentActorId: string) {
      if (scope.actorEntityId) throw new AccessDeniedError();
      return db.transaction(async (tx) => {
        await authenticate(tx);
        const conversation = await loadConversation(tx, scope, conversationId);
        if (isDirectConversation(conversation.kind) || conversation.taskEntityId)
          throw new AccessDeniedError();
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
        changed(tx, conversationId);
        return { removed: true };
      });
    },

    async joinConversation(conversationId: string) {
      if (scope.actorEntityId) throw new AccessDeniedError();
      return db.transaction(async (tx) => {
        const { actor } = await authenticate(tx);
        const conversation = await loadConversation(tx, scope, conversationId);
        if (conversation.taskEntityId || conversation.kind === "agent_dm")
          throw new AccessDeniedError();
        const changed =
          (
            await writeMembers(
              tx,
              conversationId,
              [{ ...actor, organizationId: scope.organizationId }],
              "join",
            )
          ).length > 0;
        if (changed)
          effectsFor(tx).hint({
            audience: realtimeKeys.conversation(conversationId),
            domain: "messaging",
          });
        return { joined: true, changed };
      });
    },

    // The owner names a new owner in the same call. The last member deletes instead.
    async leaveConversation(conversationId: string, newOwnerUserId?: string) {
      if (scope.actorEntityId) throw new AccessDeniedError();
      return db.transaction(async (tx) => {
        const { actor, viewer } = await authenticate(tx);
        // Leaving depends on the owner and the other members, so it claims the conversation.
        const conversation = await claimConversationChange(
          tx,
          await loadConversation(tx, scope, conversationId),
        );
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
        changed(tx, conversationId, true);
        effectsFor(tx).hint({ audience: realtimeKeys.user(scope.userId), domain: "messaging" });
        return { left: true };
      });
    },

    async transferOwnership(conversationId: string, userId: string) {
      return db.transaction(async (tx) => {
        const { viewer } = await authenticate(tx);
        const conversation = await requireManaged(tx, viewer, conversationId);
        await setOwner(tx, conversation, userId);
        if (conversation.createdBy !== userId) changed(tx, conversationId, true);
        return { ownerUserId: userId };
      });
    },

    // Counts only linked work the caller can read, so the warning leaks nothing. The count is
    // advisory; deletion authorizes again in its own transaction.
    async deleteImpact(conversationId: string) {
      return read(async (tx) => {
        const { context, viewer } = await authenticate(tx);
        await managedConversation(tx, viewer, conversationId);
        const [row] = await tx
          .select({ linkedWork: countDistinct(messageEntityReferences.entityId) })
          .from(messageEntityReferences)
          .where(
            and(
              eq(messageEntityReferences.conversationId, conversationId),
              context.readable(messageEntityReferences.entityId),
            ),
          );
        return { linkedWork: row?.linkedWork ?? 0 };
      });
    },

    // Foreign keys remove messages, members, reactions, references and alerts. Task history keeps
    // its rows without the message link.
    async deleteConversation(conversationId: string) {
      return db.transaction(async (tx) => {
        const { viewer } = await authenticate(tx);
        const conversation = await requireManaged(tx, viewer, conversationId);
        await withRemovalHints(tx, [conversation], () =>
          tx.delete(messagingConversations).where(eq(messagingConversations.id, conversationId)),
        );
        return { deleted: true };
      });
    },

    // Admin view: names and members only, never messages.
    async listManagedConversations() {
      if (scope.actorEntityId) throw new AccessDeniedError();
      return read(async (tx) => {
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
              ne(messagingConversations.kind, "agent_dm"),
              isNull(messagingConversations.taskEntityId),
            ),
          )
          .orderBy(asc(messagingConversations.createdAt), asc(messagingConversations.id));
        const byConversation = await activeMembers(
          tx,
          rows.map((row) => row.id),
          scope,
        );
        return rows.map((row) => {
          const members = (byConversation.get(row.id) ?? []).map(
            ({ actorId, type, userId, name, image }) => ({ actorId, type, userId, name, image }),
          );
          return {
            ...row,
            name: displayName(row.name, members),
            members,
          };
        });
      });
    },
  };
}
