import type { ConversationKind } from "@substrate/contracts/messaging/input";
import type { SharedConversationStatus } from "@substrate/contracts/messaging/sharing";

import type { DatabaseExecutor } from "../../../core/executor";
import { organization } from "../../../core/organizations/schema";
import type { SessionIdentity } from "../../../core/session/identity";
import { visibleConversations } from "../access";
import { activeMembers } from "../conversations/members";
import { messagingConversations, messagingParticipants } from "../schema";
import { messagingConnections, messagingInvitations } from "../sharing.schema";
import { and, asc, eq, gt, inArray, isNull, ne } from "drizzle-orm";

type ListedConversation = {
  id: string;
  name: string | null;
  kind: ConversationKind;
  hostOrganizationId: string;
};

/**
 * Adds names, partner organizations, counts and status to the shareable conversations.
 *
 * Participant names and counts need read access, or host admin management access. Other rows
 * keep only their stored name. A partner organization sees its own sharing state, never the
 * state of other partners.
 */
export async function describeSharedConversations(
  db: DatabaseExecutor,
  scope: SessionIdentity,
  admin: boolean,
  rows: ListedConversation[],
) {
  const ids = rows.map((row) => row.id);
  if (!ids.length) return [];
  const visible = new Set(
    (
      await db
        .select({ id: messagingConversations.id })
        .from(messagingConversations)
        .where(and(inArray(messagingConversations.id, ids), visibleConversations(db, scope)))
    ).map((row) => row.id),
  );
  const accessible = (row: ListedConversation) =>
    visible.has(row.id) || (admin && row.hostOrganizationId === scope.organizationId);
  const members = await activeMembers(
    db,
    rows.flatMap((row) => (accessible(row) ? [row.id] : [])),
    scope,
  );
  const connections = await db
    .select({
      conversationId: messagingConnections.conversationId,
      organizationId: messagingConnections.organizationId,
      name: organization.name,
    })
    .from(messagingConnections)
    .innerJoin(organization, eq(organization.id, messagingConnections.organizationId))
    .where(
      and(
        inArray(messagingConnections.conversationId, ids),
        isNull(messagingConnections.disconnectedAt),
      ),
    )
    .orderBy(asc(organization.name), asc(organization.id));
  const hostIds = [
    ...new Set(
      rows.flatMap((row) =>
        row.hostOrganizationId === scope.organizationId ? [] : [row.hostOrganizationId],
      ),
    ),
  ];
  const hosts = new Map(
    (hostIds.length
      ? await db
          .select({ id: organization.id, name: organization.name })
          .from(organization)
          .where(inArray(organization.id, hostIds))
      : []
    ).map((org) => [org.id, org.name]),
  );
  const invitations = await db
    .select({
      conversationId: messagingInvitations.conversationId,
      senderOrganizationId: messagingInvitations.senderOrganizationId,
      targetOrganizationId: messagingInvitations.targetOrganizationId,
    })
    .from(messagingInvitations)
    .where(
      and(
        inArray(messagingInvitations.conversationId, ids),
        eq(messagingInvitations.status, "pending"),
        gt(messagingInvitations.expiresAt, new Date()),
      ),
    );
  // Partner people who joined but must accept again before they read new messages.
  const unconsented = await db
    .select({
      conversationId: messagingParticipants.conversationId,
      organizationId: messagingParticipants.organizationId,
    })
    .from(messagingParticipants)
    .innerJoin(
      messagingConversations,
      eq(messagingConversations.id, messagingParticipants.conversationId),
    )
    .where(
      and(
        inArray(messagingParticipants.conversationId, ids),
        isNull(messagingParticipants.leftAt),
        isNull(messagingParticipants.consentedAt),
        ne(messagingParticipants.organizationId, messagingConversations.organizationId),
      ),
    );
  return rows.map((row) => {
    const host = row.hostOrganizationId === scope.organizationId;
    // A partner sees only rows about its own organization.
    const own = (organizationId: string | null) => host || organizationId === scope.organizationId;
    const partners = host
      ? connections.filter((connection) => connection.conversationId === row.id)
      : [];
    const partnerNames = host
      ? partners.map((connection) => connection.name)
      : [hosts.get(row.hostOrganizationId)!];
    const pending = invitations.filter((invite) => invite.conversationId === row.id);
    const status = sharedConversationStatus({
      needsApproval:
        pending.some(
          (invite) => invite.targetOrganizationId !== null && own(invite.targetOrganizationId),
        ) ||
        unconsented.some(
          (person) => person.conversationId === row.id && own(person.organizationId),
        ),
      connected: connections.some(
        (connection) => connection.conversationId === row.id && own(connection.organizationId),
      ),
      invited: pending.some((invite) => own(invite.senderOrganizationId)),
    });
    const people = accessible(row) ? (members.get(row.id) ?? []) : undefined;
    return {
      ...row,
      accessible: !!people,
      displayName:
        row.name ??
        (people
          ?.filter((person) => person.userId !== scope.userId)
          .map((person) => person.name)
          .join(", ") ||
          null),
      participantCount: people?.length ?? null,
      partnerOrganizationName: partnerNames[0] ?? null,
      partnerOrganizationCount: partnerNames.length,
      status,
    };
  });
}

// The state that needs someone's action comes first.
function sharedConversationStatus(state: {
  needsApproval: boolean;
  connected: boolean;
  invited: boolean;
}): SharedConversationStatus | null {
  if (state.needsApproval) return "needs-approval";
  if (state.connected) return "connected";
  if (state.invited) return "invited";
  return null;
}
