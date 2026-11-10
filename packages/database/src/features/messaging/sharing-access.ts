import type { DatabaseExecutor } from "../../client";
import { user } from "../../core/authentication/schema";
import { isOrganizationAdmin } from "../../core/organizations/roles";
import { AccessDeniedError } from "../../errors";
import { workspaceContext } from "../context/access";
import { visibleConversations, type MessagingIdentity } from "./access";
import { messagingConversations } from "./schema";
import {
  messagingConnections,
  messagingInvitations,
  messagingSharingEvents,
} from "./sharing.schema";
import { and, eq, isNull } from "drizzle-orm";

export type SharingConversation = typeof messagingConversations.$inferSelect;

export async function lockSharingConversation(db: DatabaseExecutor, id: string) {
  const [row] = await db
    .select()
    .from(messagingConversations)
    .where(eq(messagingConversations.id, id))
    .for("update");
  if (!row) throw new AccessDeniedError();
  return row;
}

export async function hasSharingConnection(
  db: DatabaseExecutor,
  conversationId: string,
  organizationId: string,
) {
  const [row] = await db
    .select()
    .from(messagingConnections)
    .where(
      and(
        eq(messagingConnections.conversationId, conversationId),
        eq(messagingConnections.organizationId, organizationId),
        isNull(messagingConnections.disconnectedAt),
      ),
    );
  return !!row;
}

export async function requireSharingManager(
  db: DatabaseExecutor,
  scope: MessagingIdentity,
  conversation: SharingConversation,
) {
  if (scope.actorEntityId) throw new AccessDeniedError();
  await workspaceContext(db, scope);
  const admin = await isOrganizationAdmin(db, scope.userId, scope.organizationId);
  if (conversation.organizationId === scope.organizationId) {
    if (
      conversation.kind === "channel"
        ? admin
        : conversation.createdBy === scope.userId || (admin && conversation.kind !== "dm")
    )
      return;
  } else if (await hasSharingConnection(db, conversation.id, scope.organizationId)) {
    if (admin && conversation.kind !== "dm") return;
    if (conversation.kind === "dm") {
      const [visible] = await db
        .select({ id: messagingConversations.id })
        .from(messagingConversations)
        .where(
          and(eq(messagingConversations.id, conversation.id), visibleConversations(db, scope)),
        );
      if (visible) return;
    }
  }
  throw new AccessDeniedError();
}

export async function recordSharingEvent(
  db: DatabaseExecutor,
  scope: MessagingIdentity,
  conversationId: string,
  action: typeof messagingSharingEvents.$inferInsert.action,
  input: { invitationId?: string; targetOrganizationId?: string } = {},
) {
  await db.insert(messagingSharingEvents).values({
    conversationId,
    organizationId: scope.organizationId,
    userId: scope.userId,
    action,
    ...input,
  });
}

export async function requireSharingRecipient(
  db: DatabaseExecutor,
  userId: string,
  invitation: typeof messagingInvitations.$inferSelect,
) {
  const [person] = await db
    .select()
    .from(user)
    .where(and(eq(user.id, userId), eq(user.emailVerified, true)));
  if (!person) throw new AccessDeniedError();
  if (invitation.recipientUserId) {
    if (person.id === invitation.recipientUserId) return person;
    const organizationApproval =
      invitation.purpose === "organization" && invitation.targetOrganizationId;
    if (organizationApproval && (await isOrganizationAdmin(db, userId, organizationApproval)))
      return person;
  } else if (person.email.toLowerCase() === invitation.email) return person;
  throw new AccessDeniedError();
}
