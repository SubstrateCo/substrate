import type { DatabaseExecutor } from "../../client";
import { organization } from "../../core/organizations/schema";
import { messagingConversations } from "./schema";
import { messagingInvitations } from "./sharing.schema";
import { and, eq, gt, isNull, lt, lte } from "drizzle-orm";

export async function claimSharingMail(db: DatabaseExecutor) {
  return db.transaction(async (tx) => {
    const [invitation] = await tx
      .select()
      .from(messagingInvitations)
      .where(
        and(
          eq(messagingInvitations.status, "pending"),
          isNull(messagingInvitations.deliveredAt),
          lt(messagingInvitations.deliveryAttempts, 5),
          lte(messagingInvitations.nextDeliveryAt, new Date()),
          gt(messagingInvitations.expiresAt, new Date()),
        ),
      )
      .for("update", { skipLocked: true })
      .limit(1);
    if (!invitation) return null;
    await tx
      .update(messagingInvitations)
      .set({
        deliveryAttempts: invitation.deliveryAttempts + 1,
        nextDeliveryAt: new Date(Date.now() + 300_000),
      })
      .where(eq(messagingInvitations.id, invitation.id));
    const [context] = await tx
      .select({ name: messagingConversations.name, organizationName: organization.name })
      .from(messagingConversations)
      .innerJoin(organization, eq(organization.id, messagingConversations.organizationId))
      .where(eq(messagingConversations.id, invitation.conversationId));
    return context
      ? {
          id: invitation.id,
          email: invitation.email,
          attempt: invitation.deliveryAttempts + 1,
          ...context,
        }
      : null;
  });
}

export async function finishSharingMail(
  db: DatabaseExecutor,
  id: string,
  attempt: number,
  sent: boolean,
) {
  await db
    .update(messagingInvitations)
    .set(
      sent
        ? { deliveredAt: new Date() }
        : { nextDeliveryAt: new Date(Date.now() + Math.min(60, 2 ** attempt) * 60_000) },
    )
    .where(
      and(
        eq(messagingInvitations.id, id),
        eq(messagingInvitations.status, "pending"),
        eq(messagingInvitations.deliveryAttempts, attempt),
      ),
    );
}
