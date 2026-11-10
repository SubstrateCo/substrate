import { realtimeKeys } from "@startup-os/contracts/realtime";
import type { RealtimeHint } from "@startup-os/contracts/realtime";

import type { DatabaseExecutor } from "../../client";
import { actors } from "../../core/actors/schema";
import { userAgents } from "../../core/actors/user-agents.schema";
import { user } from "../../core/authentication/schema";
import { member } from "../../core/organizations/schema";
import { agentRequests } from "../agent-work/requests.schema";
import {
  messagingConversations,
  messagingMessages,
  messagingParticipants,
} from "../messaging/schema";
import { messagingInvitations } from "../messaging/sharing.schema";
import { notifications } from "../notifications/schema";
import { and, eq, exists, inArray, isNotNull, isNull, notInArray, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

export async function profileRefreshHints(
  db: DatabaseExecutor,
  userId: string,
): Promise<RealtimeHint[]> {
  const organizations = await db
    .select({ id: member.organizationId })
    .from(member)
    .where(eq(member.userId, userId));
  const own = organizations.map(({ id }) => id);
  const viewer = alias(messagingParticipants, "viewer");
  // Organization hints reach every member of the user's workspaces. Conversation hints are only
  // needed where a viewer is outside them. Left conversations count: old messages show the name.
  const conversations = await db
    .selectDistinct({ id: messagingParticipants.conversationId })
    .from(messagingParticipants)
    .innerJoin(actors, eq(actors.entityId, messagingParticipants.actorEntityId))
    .innerJoin(
      messagingConversations,
      eq(messagingConversations.id, messagingParticipants.conversationId),
    )
    .where(
      and(
        eq(actors.userId, userId),
        or(
          notInArray(messagingConversations.organizationId, own),
          exists(
            db
              .select({ id: viewer.actorEntityId })
              .from(viewer)
              .where(
                and(
                  eq(viewer.conversationId, messagingParticipants.conversationId),
                  isNull(viewer.leftAt),
                  notInArray(viewer.organizationId, own),
                ),
              ),
          ),
        ),
      ),
    );
  return [
    { audience: realtimeKeys.user(userId), domain: "profile" },
    ...organizations.map(({ id }) => ({
      audience: realtimeKeys.organization(id),
      domain: "profile" as const,
    })),
    ...conversations.map(({ id }) => ({
      audience: realtimeKeys.conversation(id),
      domain: "profile" as const,
    })),
  ];
}

// Members see agents as names and pictures in messages and tasks; "profile" refreshes those labels.
// Access hints force session rechecks and reset private caches, so keep them for grant changes.
export async function agentRefreshHints(
  db: DatabaseExecutor,
  userId: string,
): Promise<RealtimeHint[]> {
  const organizations = await db
    .selectDistinct({ id: actors.organizationId })
    .from(actors)
    .innerJoin(userAgents, eq(userAgents.id, actors.userAgentId))
    .where(eq(userAgents.userId, userId));
  return [
    { audience: realtimeKeys.user(userId), domain: "agents" },
    ...organizations.map(({ id }) => ({
      audience: realtimeKeys.organization(id),
      domain: "profile" as const,
    })),
  ];
}

// A project grant changes what the granted actor can read, and an agent's reads are shown to its owner.
// Other workspace members keep their access, so they only need a task refresh.
export async function projectAccessRefreshHints(
  db: DatabaseExecutor,
  organizationId: string,
  actorEntityId: string,
): Promise<RealtimeHint[]> {
  const agent = alias(actors, "agent");
  const owners = await db
    .select({ id: actors.entityId })
    .from(agent)
    .innerJoin(userAgents, eq(userAgents.id, agent.userAgentId))
    .innerJoin(
      actors,
      and(
        eq(actors.userId, userAgents.userId),
        eq(actors.organizationId, organizationId),
        eq(actors.type, "human"),
      ),
    )
    .where(and(eq(agent.organizationId, organizationId), eq(agent.entityId, actorEntityId)));
  return [
    { audience: realtimeKeys.organization(organizationId), domain: "tasks" },
    ...[actorEntityId, ...owners.map(({ id }) => id)].map((id) => ({
      audience: realtimeKeys.actor(organizationId, id),
      domain: "access" as const,
    })),
  ];
}

function verifiedUsersByEmail(db: DatabaseExecutor, email: string) {
  return db
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.email, email), eq(user.emailVerified, true)));
}

export async function invitationRefreshHints(
  db: DatabaseExecutor,
  organizationId: string,
  email: string,
): Promise<RealtimeHint[]> {
  const users = await verifiedUsersByEmail(db, email);
  return [
    { audience: realtimeKeys.organization(organizationId), domain: "organization" },
    ...users.map(({ id }) => ({
      audience: realtimeKeys.user(id),
      domain: "organization" as const,
    })),
  ];
}

// Built inside the transaction from the changed row. Emails are stored lowercase.
export async function sharingInvitationHints(
  db: DatabaseExecutor,
  invite: typeof messagingInvitations.$inferSelect,
): Promise<RealtimeHint[]> {
  const recipients = await verifiedUsersByEmail(db, invite.email);
  return [
    ...[
      ...new Set([
        invite.hostOrganizationId,
        invite.senderOrganizationId,
        ...(invite.targetOrganizationId ? [invite.targetOrganizationId] : []),
      ]),
    ].map((id) => ({ audience: realtimeKeys.organization(id), domain: "access" as const })),
    ...[...new Set([invite.inviterId, ...recipients.map((person) => person.id)])].map((id) => ({
      audience: realtimeKeys.user(id),
      domain: "access" as const,
    })),
  ];
}

// Call before the conversation is deleted. Conversation audiences check the live row, so they
// cannot reach anyone afterwards; these hints use user, organization, and actor audiences instead.
export async function conversationRemovalHints(
  db: DatabaseExecutor,
  conversations: { id: string; organizationId: string }[],
): Promise<RealtimeHint[]> {
  if (!conversations.length) return [];
  const ids = conversations.map((conversation) => conversation.id);
  const participants = await db
    .selectDistinct({ userId: sql<string>`${actors.userId}` })
    .from(messagingParticipants)
    .innerJoin(actors, eq(actors.entityId, messagingParticipants.actorEntityId))
    .where(
      and(
        inArray(messagingParticipants.conversationId, ids),
        isNull(messagingParticipants.leftAt),
        isNotNull(actors.userId),
      ),
    );
  const recipients = await db
    .selectDistinct({
      organizationId: notifications.organizationId,
      actorId: notifications.recipientActorEntityId,
    })
    .from(notifications)
    .innerJoin(messagingMessages, eq(messagingMessages.id, notifications.messageId))
    .where(inArray(messagingMessages.conversationId, ids));
  // Requests go with the conversation and no wake reports it, so their owners refresh.
  const requestOwners = await db
    .selectDistinct({ userId: agentRequests.ownerUserId })
    .from(agentRequests)
    .where(inArray(agentRequests.conversationId, ids));
  const organizations = [...new Set(conversations.map((row) => row.organizationId))];
  return [
    ...participants.map(({ userId }) => ({
      audience: realtimeKeys.user(userId),
      domain: "messaging" as const,
    })),
    ...organizations.flatMap((id) => [
      { audience: realtimeKeys.organization(id), domain: "messaging" as const },
      { audience: realtimeKeys.organization(id), domain: "context" as const },
    ]),
    ...recipients.map(({ organizationId, actorId }) => ({
      audience: realtimeKeys.actor(organizationId, actorId),
      domain: "notifications" as const,
    })),
    ...requestOwners.map(({ userId }) => ({
      audience: realtimeKeys.user(userId),
      domain: "agent-work" as const,
    })),
  ];
}

// Builds hints from what a send or reaction changed, so nothing is read back after commit.
// Membership changes refresh conversation lists; other changes touch only message content.
export function messageChangeHints(
  change: { conversationId: string; organizationId: string },
  effects: {
    joined: boolean;
    referenced?: boolean;
    notified?: { organizationId: string; actorId: string }[];
  },
): RealtimeHint[] {
  const conversation: RealtimeHint = {
    audience: realtimeKeys.conversation(change.conversationId),
    domain: "messaging",
  };
  if (!effects.joined) conversation.scope = "messages";
  return [
    conversation,
    ...(effects.referenced
      ? [{ audience: realtimeKeys.organization(change.organizationId), domain: "context" as const }]
      : []),
    ...(effects.notified ?? []).map(({ organizationId, actorId }) => ({
      audience: realtimeKeys.actor(organizationId, actorId),
      domain: "notifications" as const,
    })),
  ];
}
