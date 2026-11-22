import { effectsFor } from "../../../core/effects";
import type { DatabaseExecutor } from "../../../core/executor";
import { organization } from "../../../core/organizations/schema";
import { sharingInvitationHints } from "../../realtime/routing";
import { messagingConversations } from "../schema";
import { messagingInvitations } from "../sharing.schema";
import { and, eq, sql } from "drizzle-orm";

export async function claimSharingMail(db: DatabaseExecutor) {
  const [row] = await db.execute<{
    id: string;
    email: string;
    attempt: number;
    name: string | null;
    organizationName: string;
  }>(sql`
    WITH candidate AS (
      SELECT ${messagingInvitations.id} AS id, ${messagingConversations.name} AS name,
        ${organization.name} AS organization_name
      FROM ${messagingInvitations}
      JOIN ${messagingConversations} ON ${messagingConversations.id} = ${messagingInvitations.conversationId}
      JOIN ${organization} ON ${organization.id} = ${messagingConversations.organizationId}
      WHERE ${messagingInvitations.status} = 'pending'
        AND ${messagingInvitations.deliveredAt} IS NULL
        AND ${messagingInvitations.deliveryAttempts} < 5
        AND ${messagingInvitations.nextDeliveryAt} <= now()
        AND ${messagingInvitations.expiresAt} > now()
      ORDER BY ${messagingInvitations.createdAt}
      FOR UPDATE OF ${messagingInvitations} SKIP LOCKED LIMIT 1
    )
    UPDATE ${messagingInvitations}
    SET delivery_attempts = ${messagingInvitations.deliveryAttempts} + 1,
      next_delivery_at = now() + interval '5 minutes'
    FROM candidate WHERE ${messagingInvitations.id} = candidate.id
    RETURNING ${messagingInvitations.id} AS id, ${messagingInvitations.email} AS email,
      ${messagingInvitations.deliveryAttempts} AS attempt, candidate.name,
      candidate.organization_name AS "organizationName"
  `);
  return row ?? null;
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
