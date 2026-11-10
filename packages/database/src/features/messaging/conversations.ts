import type { DatabaseExecutor } from "../../client";
import { actors } from "../../core/actors/schema";
import { userAgents } from "../../core/actors/user-agents.schema";
import { user } from "../../core/authentication/schema";
import { organization } from "../../core/organizations/schema";
import { AccessDeniedError, ValidationError } from "../../errors";
import { messageEntityReferences } from "../context/schema";
import { conversationRemovalHints } from "../realtime/routing";
import {
  loadConversation,
  visibleConversations,
  type MessagingIdentity,
  messagingSession,
} from "./access";
import { findDirectMessage, findExternalDirectMessage } from "./direct-messages";
import { activeMembers, endParticipation, hasOtherPerson, setOwner, writeMembers } from "./members";
import {
  canManage,
  canShare,
  leaveBlocked,
  leavePlan,
  validateCreate,
  type Viewer,
} from "./policy";
import { ownedAgents, recipients } from "./recipients";
import { messagingConversations, messagingParticipants } from "./schema";
import { messagingConnections } from "./sharing.schema";
import { queueSharingInvitations } from "./sharing/invitations";
import { and, asc, countDistinct, eq, inArray, isNull, ne, or } from "drizzle-orm";

interface CreateConversationInput {
  kind: "dm" | "group" | "channel";
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

// Conversation membership and management. Scope comes from the authenticated session.
export function conversationOperations(db: DatabaseExecutor, scope: Readonly<MessagingIdentity>) {
  const authenticate = (tx: DatabaseExecutor) => messagingSession(tx, scope);

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
            ...row,
            organizations: channelOrganizations,
            partner: channelOrganizations.some((org) => !org.own),
            name: displayName(
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
        const { people, external } = await recipients(tx, scope, input.emails ?? []);
        const selected = [...people, ...(await ownedAgents(tx, scope, input.agentIds ?? []))];
        const values = validateCreate(input, selected.length + external.length);
        if (input.kind === "dm") {
          const existing = external.length
            ? await findExternalDirectMessage(tx, scope, external[0]!)
            : await findDirectMessage(tx, scope.organizationId, [
                actor.entityId,
                selected[0]!.entityId,
              ]);
          if (existing) return existing;
        }
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
        // An existing DM is returned above without a new invitation.
        await queueSharingInvitations(
          tx,
          scope,
          conversation!,
          { emails: external, shareHistory: input.shareHistory === true },
          viewer,
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
        await queueSharingInvitations(
          tx,
          scope,
          conversation,
          { emails: external, shareHistory },
          viewer,
        );
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
              context.readable(messageEntityReferences.entityId),
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
        const hints = await conversationRemovalHints(tx, [conversation]);
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
