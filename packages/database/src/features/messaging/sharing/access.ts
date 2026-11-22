import { user } from "../../../core/authentication/schema";
import type { DatabaseExecutor } from "../../../core/executor";
import { isOrganizationAdmin } from "../../../core/organizations/roles";
import type { SessionIdentity } from "../../../core/session/identity";
import { workspaceContext } from "../../../core/session/workspace";
import { AccessDeniedError } from "../../../errors";
import { visibleConversations, type Conversation } from "../access";
import { canShare, hosts, viewerOf, type Viewer } from "../policy";
import { messagingConversations } from "../schema";
import {
  messagingConnections,
  messagingInvitations,
  messagingSharingEvents,
} from "../sharing.schema";
import { and, eq, isNull } from "drizzle-orm";

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
  scope: SessionIdentity,
  conversation: Conversation,
) {
  if (scope.actorEntityId) throw new AccessDeniedError();
  const viewer = viewerOf(scope, (await workspaceContext(db, scope)).admin);
  return checkSharingManager(db, scope, conversation, viewer);
}

export async function checkSharingManager(
  db: DatabaseExecutor,
  scope: SessionIdentity,
  conversation: Conversation,
  viewer: Viewer,
) {
  if (viewer.agent) throw new AccessDeniedError();
  // Only partners need the connection, and only partner DMs the visibility.
  const partner = { connected: false, visible: false };
  if (!hosts(conversation, viewer)) {
    partner.connected = await hasSharingConnection(db, conversation.id, scope.organizationId);
    if (partner.connected && conversation.kind === "dm") {
      const [visible] = await db
        .select({ id: messagingConversations.id })
        .from(messagingConversations)
        .where(
          and(eq(messagingConversations.id, conversation.id), visibleConversations(db, scope)),
        );
      partner.visible = !!visible;
    }
  }
  if (!canShare(conversation, viewer, partner)) throw new AccessDeniedError();
  return viewer;
}

export async function recordSharingEvents(
  db: DatabaseExecutor,
  scope: SessionIdentity,
  conversationId: string,
  action: typeof messagingSharingEvents.$inferInsert.action,
  inputs: { invitationId?: string; targetOrganizationId?: string }[],
) {
  if (!inputs.length) return;
  await db.insert(messagingSharingEvents).values(
    inputs.map((input) => ({
      conversationId,
      organizationId: scope.organizationId,
      userId: scope.userId,
      action,
      ...input,
    })),
  );
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
  } else if (person.email === invitation.email) return person;
  throw new AccessDeniedError();
}
