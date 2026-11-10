import type { DatabaseExecutor } from "../../../client";
import { actorPicture } from "../../../core/actors/picture";
import { actors } from "../../../core/actors/schema";
import { user } from "../../../core/authentication/schema";
import { organization } from "../../../core/organizations/schema";
import { AccessDeniedError } from "../../../errors";
import { workspaceContext } from "../../context/access";
import { visibleConversations, type MessagingIdentity } from "../access";
import { messagingConversations, messagingParticipants } from "../schema";
import {
  messagingConnections,
  messagingInvitations,
  messagingSharingEvents,
} from "../sharing.schema";
import { requireSharingManager } from "./access";
import { and, desc, eq, gt, inArray, isNull, ne, or } from "drizzle-orm";

export function sharingQueries(db: DatabaseExecutor, scope: MessagingIdentity) {
  return {
    async list(conversationId: string) {
      return db.transaction(async (tx) => {
        const [conversation] = await tx
          .select()
          .from(messagingConversations)
          .where(eq(messagingConversations.id, conversationId));
        if (!conversation) throw new AccessDeniedError();
        await requireSharingManager(tx, scope, conversation);
        const host = conversation.organizationId === scope.organizationId;
        const connections = await tx
          .select({
            organizationId: messagingConnections.organizationId,
            name: organization.name,
            disconnectedAt: messagingConnections.disconnectedAt,
          })
          .from(messagingConnections)
          .innerJoin(organization, eq(organization.id, messagingConnections.organizationId))
          .where(
            and(
              eq(messagingConnections.conversationId, conversationId),
              host ? undefined : eq(messagingConnections.organizationId, scope.organizationId),
            ),
          );
        const invitations = await tx
          .select({
            id: messagingInvitations.id,
            email: messagingInvitations.email,
            status: messagingInvitations.status,
            expiresAt: messagingInvitations.expiresAt,
            deliveredAt: messagingInvitations.deliveredAt,
            deliveryAttempts: messagingInvitations.deliveryAttempts,
            senderOrganizationId: messagingInvitations.senderOrganizationId,
          })
          .from(messagingInvitations)
          .where(
            and(
              eq(messagingInvitations.conversationId, conversationId),
              host
                ? undefined
                : eq(messagingInvitations.senderOrganizationId, scope.organizationId),
            ),
          )
          .orderBy(desc(messagingInvitations.createdAt))
          .limit(100);
        const participants = await tx
          .select({
            actorId: actors.entityId,
            image: actorPicture(scope),
            name: user.name,
            organizationId: messagingParticipants.organizationId,
            consentedAt: messagingParticipants.consentedAt,
          })
          .from(messagingParticipants)
          .innerJoin(actors, eq(actors.entityId, messagingParticipants.actorEntityId))
          .innerJoin(user, eq(user.id, actors.userId))
          .where(
            and(
              eq(messagingParticipants.conversationId, conversationId),
              ne(messagingParticipants.organizationId, conversation.organizationId),
              isNull(messagingParticipants.leftAt),
              host ? undefined : eq(messagingParticipants.organizationId, scope.organizationId),
            ),
          );
        const events = await tx
          .select({
            id: messagingSharingEvents.id,
            action: messagingSharingEvents.action,
            userName: user.name,
            createdAt: messagingSharingEvents.createdAt,
          })
          .from(messagingSharingEvents)
          .innerJoin(user, eq(user.id, messagingSharingEvents.userId))
          .where(
            and(
              eq(messagingSharingEvents.conversationId, conversationId),
              host ? undefined : eq(messagingSharingEvents.organizationId, scope.organizationId),
            ),
          )
          .orderBy(desc(messagingSharingEvents.createdAt))
          .limit(30);
        return { connections, invitations, participants, events, host, kind: conversation.kind };
      });
    },
    async listConversations() {
      const { admin } = await workspaceContext(db, scope);
      return db
        .select({
          id: messagingConversations.id,
          name: messagingConversations.name,
          kind: messagingConversations.kind,
          hostOrganizationId: messagingConversations.organizationId,
        })
        .from(messagingConversations)
        .where(
          or(
            and(
              eq(messagingConversations.organizationId, scope.organizationId),
              admin
                ? or(
                    ne(messagingConversations.kind, "dm"),
                    eq(messagingConversations.createdBy, scope.userId),
                  )
                : and(
                    ne(messagingConversations.kind, "channel"),
                    eq(messagingConversations.createdBy, scope.userId),
                  ),
            ),
            admin
              ? and(
                  ne(messagingConversations.kind, "dm"),
                  inArray(
                    messagingConversations.id,
                    db
                      .select({ id: messagingConnections.conversationId })
                      .from(messagingConnections)
                      .where(
                        and(
                          eq(messagingConnections.organizationId, scope.organizationId),
                          isNull(messagingConnections.disconnectedAt),
                        ),
                      ),
                  ),
                )
              : undefined,
            // Host DMs are shared by their creator only, above. Partners share DMs they can see.
            and(
              eq(messagingConversations.kind, "dm"),
              ne(messagingConversations.organizationId, scope.organizationId),
              visibleConversations(db, scope),
            ),
          ),
        )
        .orderBy(desc(messagingConversations.createdAt));
    },
    async inbox() {
      const { admin } = await workspaceContext(db, scope);
      const [person] = await db
        .select({ email: user.email })
        .from(user)
        .where(eq(user.id, scope.userId));
      return db
        .select({
          id: messagingInvitations.id,
          conversationId: messagingInvitations.conversationId,
          email: messagingInvitations.email,
          purpose: messagingInvitations.purpose,
          expiresAt: messagingInvitations.expiresAt,
          name: messagingConversations.name,
        })
        .from(messagingInvitations)
        .innerJoin(
          messagingConversations,
          eq(messagingConversations.id, messagingInvitations.conversationId),
        )
        .where(
          and(
            eq(messagingInvitations.status, "pending"),
            gt(messagingInvitations.expiresAt, new Date()),
            or(
              eq(messagingInvitations.recipientUserId, scope.userId),
              and(
                isNull(messagingInvitations.recipientUserId),
                eq(messagingInvitations.email, person!.email),
              ),
              admin
                ? and(
                    eq(messagingInvitations.targetOrganizationId, scope.organizationId),
                    eq(messagingInvitations.purpose, "organization"),
                  )
                : undefined,
            ),
          ),
        );
    },
  };
}
