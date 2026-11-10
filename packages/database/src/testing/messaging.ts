import type { DatabaseExecutor } from "../client";
import { actors } from "../core/actors/schema";
import type { MessagingIdentity } from "../features/messaging/access";
import { messagingConversations, messagingParticipants } from "../features/messaging/schema";
import { createMessagingService } from "../features/messaging/service";
import { messagingInvitations } from "../features/messaging/sharing.schema";
import { createSharingService } from "../features/messaging/sharing/service";
import { member, user } from "../schema";
import { and, asc, eq, ne } from "drizzle-orm";

// Existing domain tests need an already-approved collaboration fixture, not pending invitations.
async function acceptFixtureInvitations(db: DatabaseExecutor, conversationId: string) {
  const invites = await db
    .select()
    .from(messagingInvitations)
    .where(
      and(
        eq(messagingInvitations.conversationId, conversationId),
        eq(messagingInvitations.status, "pending"),
      ),
    );
  for (const invite of invites) {
    const candidates = await db
      .select({ userId: user.id, organizationId: member.organizationId })
      .from(user)
      .innerJoin(member, eq(member.userId, user.id))
      .where(
        and(
          eq(user.email, invite.email),
          eq(user.emailVerified, true),
          ne(member.organizationId, invite.hostOrganizationId),
        ),
      )
      .orderBy(asc(member.organizationId));
    const person = candidates[0];
    if (!person) continue;
    const accepted = await createSharingService(db, person).accept(invite.id, true);
    if (accepted.status === "approval-required") {
      const [admin] = await db
        .select({ userId: member.userId, organizationId: member.organizationId })
        .from(member)
        .where(and(eq(member.organizationId, person.organizationId), eq(member.role, "owner")));
      if (!admin) throw new Error("An approved test fixture needs an organization owner.");
      await createSharingService(db, admin).accept(invite.id, true);
    }
  }
}

export async function approveFixtureParticipants(db: DatabaseExecutor, conversationId: string) {
  const [conversation] = await db
    .select()
    .from(messagingConversations)
    .where(eq(messagingConversations.id, conversationId));
  if (!conversation) throw new Error("Missing fixture conversation.");
  const people = await db
    .select({ email: user.email })
    .from(messagingParticipants)
    .innerJoin(actors, eq(actors.entityId, messagingParticipants.actorEntityId))
    .innerJoin(user, eq(user.id, actors.userId))
    .where(
      and(
        eq(messagingParticipants.conversationId, conversationId),
        ne(messagingParticipants.organizationId, conversation.organizationId),
      ),
    );
  for (const person of people)
    await createSharingService(db, {
      userId: conversation.createdBy,
      organizationId: conversation.organizationId,
    }).invite(conversationId, { email: person.email, shareHistory: true });
  await acceptFixtureInvitations(db, conversationId);
}

export function createAcceptedMessagingService(db: DatabaseExecutor, scope: MessagingIdentity) {
  const service = createMessagingService(db, scope);
  return {
    ...service,
    async createConversation(input: Parameters<typeof service.createConversation>[0]) {
      const conversation = await service.createConversation({ ...input, shareHistory: true });
      await acceptFixtureInvitations(db, conversation.id);
      return conversation;
    },
    async addMembers(id: string, emails: string[]) {
      const result = await service.addMembers(id, emails, true);
      await acceptFixtureInvitations(db, id);
      return { added: result.added + (result.invited ?? 0) };
    },
  };
}
