import { realtimeKeys } from "@startup-os/contracts/realtime";
import type { RealtimeHint } from "@startup-os/contracts/realtime";

import type { DatabaseExecutor } from "../../client";
import { actors } from "../../core/actors/schema";
import { userAgents } from "../../core/actors/user-agents.schema";
import { user } from "../../core/authentication/schema";
import { member } from "../../core/organizations/schema";
import { messagingMessages, messagingParticipants } from "../messaging/schema";
import { notifications } from "../notifications/schema";
import { and, eq } from "drizzle-orm";

export async function profileRefreshHints(
  db: DatabaseExecutor,
  userId: string,
): Promise<RealtimeHint[]> {
  const organizations = await db
    .select({ id: member.organizationId })
    .from(member)
    .where(eq(member.userId, userId));
  const conversations = await db
    .selectDistinct({ id: messagingParticipants.conversationId })
    .from(messagingParticipants)
    .where(eq(messagingParticipants.userId, userId));
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
      domain: "access" as const,
    })),
  ];
}

export async function invitationRefreshHints(
  db: DatabaseExecutor,
  organizationId: string,
  email: string,
): Promise<RealtimeHint[]> {
  const users = await db
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.email, email), eq(user.emailVerified, true)));
  return [
    { audience: realtimeKeys.organization(organizationId), domain: "organization" },
    ...users.map(({ id }) => ({
      audience: realtimeKeys.user(id),
      domain: "organization" as const,
    })),
  ];
}

export async function messageRefreshHints(
  db: DatabaseExecutor,
  messageId: string,
): Promise<RealtimeHint[]> {
  const [message] = await db
    .select({ conversationId: messagingMessages.conversationId })
    .from(messagingMessages)
    .where(eq(messagingMessages.id, messageId));
  if (!message) return [];
  const recipients = await db
    .selectDistinct({
      organizationId: notifications.organizationId,
      actorId: notifications.recipientActorEntityId,
    })
    .from(notifications)
    .where(eq(notifications.messageId, messageId));
  return [
    { audience: realtimeKeys.conversation(message.conversationId), domain: "messaging" },
    ...recipients.map(({ organizationId, actorId }) => ({
      audience: realtimeKeys.actor(organizationId, actorId),
      domain: "notifications" as const,
    })),
  ];
}
