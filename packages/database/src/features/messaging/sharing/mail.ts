import type { DatabaseExecutor } from "../../../client";
import { effectsFor } from "../../../core/effects";
import { organization } from "../../../core/organizations/schema";
import { sharingInvitationHints } from "../../realtime/routing";
import { messagingConversations } from "../schema";
import { messagingInvitations } from "../sharing.schema";
import { and, asc, eq, gt, isNull, lt, lte } from "drizzle-orm";

export async function claimSharingMail(db: DatabaseExecutor) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({
        invitation: messagingInvitations,
        name: messagingConversations.name,
        organizationName: organization.name,
      })
      .from(messagingInvitations)
      .innerJoin(
        messagingConversations,
        eq(messagingConversations.id, messagingInvitations.conversationId),
      )
      .innerJoin(organization, eq(organization.id, messagingConversations.organizationId))
      .where(
        and(
          eq(messagingInvitations.status, "pending"),
          isNull(messagingInvitations.deliveredAt),
          lt(messagingInvitations.deliveryAttempts, 5),
          lte(messagingInvitations.nextDeliveryAt, new Date()),
          gt(messagingInvitations.expiresAt, new Date()),
        ),
      )
      .orderBy(asc(messagingInvitations.createdAt))
      .for("update", { of: messagingInvitations, skipLocked: true })
      .limit(1);
    if (!row) return null;
    const { invitation, name, organizationName } = row;
    await tx
      .update(messagingInvitations)
      .set({
        deliveryAttempts: invitation.deliveryAttempts + 1,
        nextDeliveryAt: new Date(Date.now() + 300_000),
      })
      .where(eq(messagingInvitations.id, invitation.id));
    return {
      id: invitation.id,
      email: invitation.email,
      attempt: invitation.deliveryAttempts + 1,
      name,
      organizationName,
    };
  });
}

export async function finishSharingMail(
  db: DatabaseExecutor,
  id: string,
  attempt: number,
  sent: boolean,
) {
  const [finished] = await db
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
    )
    .returning();
  // The sharing list shows delivery. A lease lost to another sender changes nothing here.
  const hints = finished ? await sharingInvitationHints(db, finished) : [];
  for (const hint of hints) effectsFor(db).hint(hint);
  return null;
}
