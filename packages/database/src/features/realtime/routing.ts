import { realtimeKeys, realtimeTaskLimit } from "@substrate/contracts/realtime";
import type { RealtimeHint } from "@substrate/contracts/realtime";

import { actors } from "../../core/actors/schema";
import { userAgents } from "../../core/actors/user-agents.schema";
import { user } from "../../core/authentication/schema";
import { effectsFor } from "../../core/effects";
import { entities } from "../../core/entities/schema";
import type { DatabaseExecutor } from "../../core/executor";
import { member } from "../../core/organizations/schema";
import { agentRequests } from "../agent-work/requests/requests.schema";
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

interface CrmContextRecord {
  entityId: string;
  entityType: "contact" | "account" | "deal" | "contact_interaction";
  accessEntityId: string;
}

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

export function referenceChangeHints(
  organizationId: string,
  work: (WorkRecord | CrmContextRecord)[],
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
    ...projectHints(
      organizationId,
      work.filter((record): record is WorkRecord => "projectEntityId" in record),
      "context",
    ),
    ...work.flatMap((record) =>
      "projectEntityId" in record
        ? []
        : [
            {
              audience: realtimeKeys.entity(organizationId, record.accessEntityId),
              domain: "context" as const,
            },
          ],
    ),
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

export async function sharingInvitationHints(
  db: DatabaseExecutor,
  invite: typeof messagingInvitations.$inferSelect,
): Promise<RealtimeHint[]> {
  return sharingInvitationsHints(db, [invite]);
}

export async function sharingInvitationsHints(
  db: DatabaseExecutor,
  invites: (typeof messagingInvitations.$inferSelect)[],
): Promise<RealtimeHint[]> {
  if (!invites.length) return [];
  const recipients = await db
    .select({ id: user.id, email: user.email })
    .from(user)
    .where(
      and(
        inArray(user.email, [...new Set(invites.map((invite) => invite.email))]),
        eq(user.emailVerified, true),
      ),
    );
  const byEmail = new Map(recipients.map((person) => [person.email, person.id]));
  return invites.flatMap((invite) => {
    const recipientId = byEmail.get(invite.email);
    return [
      ...[
        ...new Set([
          invite.hostOrganizationId,
          invite.senderOrganizationId,
          ...(invite.targetOrganizationId ? [invite.targetOrganizationId] : []),
        ]),
      ].map((id) => ({ audience: realtimeKeys.organization(id), domain: "access" as const })),
      ...[...new Set([invite.inviterId, ...(recipientId ? [recipientId] : [])])].map((id) => ({
        audience: realtimeKeys.user(id),
        domain: "access" as const,
      })),
    ];
  });
}

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

export function messageChangeHints(
  change: {
    conversationId: string;
    organizationId: string;
    messageId?: string;
    threadId?: string | null;
  },
  effects: {
    joined: boolean;
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
