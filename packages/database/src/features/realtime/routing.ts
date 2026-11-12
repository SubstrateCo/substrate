import { realtimeKeys, realtimeTaskLimit } from "@substrate/contracts/realtime";
import type { RealtimeHint } from "@substrate/contracts/realtime";

import type { DatabaseExecutor } from "../../client";
import { actors } from "../../core/actors/schema";
import { userAgents } from "../../core/actors/user-agents.schema";
import { user } from "../../core/authentication/schema";
import { effectsFor } from "../../core/effects";
import { entities } from "../../core/entities/schema";
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

// Work hints reach only the readers of the project, so the project and task IDs they name never
// reach anyone who cannot read them. A change to the project itself, or to more tasks than a hint
// names, names only the project.
export function workHint(
  organizationId: string,
  projectId: string,
  taskIds: string[] = [],
  domain: "tasks" | "context" = "tasks",
): RealtimeHint {
  const hint: Extract<RealtimeHint, { domain: "tasks" | "context" }> = {
    audience: realtimeKeys.entity(organizationId, projectId),
    domain,
    projectId,
  };
  const tasks = [...new Set(taskIds)].sort();
  if (tasks.length && tasks.length <= realtimeTaskLimit) hint.taskIds = tasks;
  return hint;
}

interface WorkRecord {
  entityId: string;
  projectEntityId: string;
}

// One hint per project. A record that is the project itself names only the project.
function projectHints(
  organizationId: string,
  records: WorkRecord[],
  domain: "tasks" | "context",
): RealtimeHint[] {
  const projects = new Map<string, string[] | null>();
  for (const { entityId, projectEntityId } of records) {
    const tasks = projects.get(projectEntityId);
    if (entityId === projectEntityId || tasks === null) projects.set(projectEntityId, null);
    else projects.set(projectEntityId, [...(tasks ?? []), entityId]);
  }
  return [...projects].map(([projectId, taskIds]) =>
    workHint(organizationId, projectId, taskIds ?? [], domain),
  );
}

// Reads each record's project for callers that do not have it.
export async function workChangeHints(
  db: DatabaseExecutor,
  organizationId: string,
  entityIds: string[],
): Promise<RealtimeHint[]> {
  if (!entityIds.length) return [];
  const rows = await db
    .select({ entityId: entities.entityId, projectEntityId: entities.accessEntityId })
    .from(entities)
    .where(
      and(
        eq(entities.organizationId, organizationId),
        inArray(entities.entityId, [...new Set(entityIds)]),
      ),
    );
  return projectHints(organizationId, rows, "tasks");
}

// References between a message and work changed. Each referenced record's readers refresh its
// related lists. When an existing message changed, its conversation's viewers refresh its context
// pages. Each audience sees only IDs it can already read.
export function referenceChangeHints(
  organizationId: string,
  work: WorkRecord[],
  message?: { id: string; conversationId: string },
): RealtimeHint[] {
  return [
    ...(message
      ? [
          {
            audience: realtimeKeys.conversation(message.conversationId),
            domain: "context" as const,
            messageId: message.id,
          },
        ]
      : []),
    ...projectHints(organizationId, work, "context"),
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

// Reads the removal hints, then runs `mutate`, which deletes the conversations or ends
// participation. The hints are registered only after `mutate` succeeds. A `domain` replaces each
// hint's domain, such as "access" when the change revokes access.
export async function withRemovalHints<T>(
  tx: DatabaseExecutor,
  conversations: { id: string; organizationId: string }[],
  mutate: () => Promise<T>,
  options: { domain?: Exclude<RealtimeHint["domain"], "messaging"> } = {},
): Promise<T> {
  const hints = await conversationRemovalHints(tx, conversations);
  const result = await mutate();
  const { domain } = options;
  const effects = effectsFor(tx);
  for (const hint of hints) effects.hint(domain ? { audience: hint.audience, domain } : hint);
  return result;
}

// Use withRemovalHints. Conversation audiences check the live row, so they cannot reach anyone
// after a removal; these hints use user, organization, and actor audiences instead.
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

// A reaction changes only one message's reactions: not unread counts, order, or other
// conversations. Joining the conversation also changes conversation lists.
export function reactionChangeHints(
  change: {
    conversationId: string;
    organizationId: string;
    messageId: string;
    threadId: string | null;
  },
  joined: boolean,
): RealtimeHint[] {
  if (joined) return messageChangeHints(change, { joined });
  return [
    {
      audience: realtimeKeys.conversation(change.conversationId),
      domain: "messaging",
      scope: "reactions",
      messageId: change.messageId,
      threadId: change.threadId,
    },
  ];
}

// Builds hints from what a send or reaction changed, so nothing is read back after commit.
// Membership changes refresh conversation lists; other changes touch only message content: the
// new message's thread, or its main timeline when threadId is null.
export function messageChangeHints(
  change: {
    conversationId: string;
    organizationId: string;
    messageId?: string;
    threadId?: string | null;
  },
  effects: {
    joined: boolean;
    // Work the new message references. Its page loads after the commit, with its references.
    work?: WorkRecord[];
  },
): RealtimeHint[] {
  const conversation: RealtimeHint = {
    audience: realtimeKeys.conversation(change.conversationId),
    domain: "messaging",
  };
  if (!effects.joined) {
    conversation.scope = "messages";
    if (change.messageId) conversation.messageId = change.messageId;
    if (change.threadId !== undefined) conversation.threadId = change.threadId;
  }
  return [conversation, ...referenceChangeHints(change.organizationId, effects.work ?? [])];
}
