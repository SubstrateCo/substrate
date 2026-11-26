import { activeActorCondition } from "../../core/actors/access";
import { actors } from "../../core/actors/schema";
import { user } from "../../core/authentication/schema";
import { entities } from "../../core/entities/schema";
import { readableCondition } from "../../core/permissions/visibility";
import type { RepositoryContext } from "../../core/repository-context";
import { visibleConversations } from "../messaging/access";
import { messagingConversations, messagingParticipants } from "../messaging/schema";
import { notifications } from "./schema";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";

type Kind = typeof notifications.$inferInsert.kind;
type Recipient = { actorEntityId: string } | { userId: string };
type Target =
  | { entityId: string; eventKey: string }
  | {
      messageId: string;
      conversationId: string;
      conversationOrganizationId: string;
      eventKey: string;
    };

// All notification kinds require a verified, active human workspace member with target access.
// A recipient gets one alert per event: the first group that names them sets its kind.
// `seenBy` names actors who have the target in view. Their notice is stored read, for the history,
// and does not alert them.
export async function notify(
  ctx: RepositoryContext,
  groups: { kind: Kind; recipients: Recipient[] }[],
  target: Target,
  { seenBy = [] }: { seenBy?: string[] } = {},
) {
  const recipients = groups.flatMap((group) => group.recipients);
  if (!recipients.length) return [];
  const actorIdsOf = (rows: Recipient[]) =>
    rows.flatMap((row) => ("actorEntityId" in row ? [row.actorEntityId] : []));
  // Entity targets reach recipients only by actor.
  const userIdsOf = (rows: Recipient[]) =>
    "entityId" in target ? [] : rows.flatMap((row) => ("userId" in row ? [row.userId] : []));
  const actorIds = actorIdsOf(recipients);
  const userIds = userIdsOf(recipients);
  const matches = groups.flatMap((group) => {
    const named = or(
      actorIdsOf(group.recipients).length
        ? inArray(actors.entityId, actorIdsOf(group.recipients))
        : undefined,
      userIdsOf(group.recipients).length
        ? inArray(actors.userId, userIdsOf(group.recipients))
        : undefined,
    );
    return named ? [sql`WHEN ${named} THEN ${group.kind}::text`] : [];
  });
  // Every candidate the filter keeps is named by a group, so the CASE always has a match.
  const kind = matches.length ? sql<Kind>`CASE ${sql.join(matches, sql` `)} END` : sql<Kind>`NULL`;
  // Insert-select lists every column in table order. The id and creation time repeat the column
  // defaults. The joins use unique keys, so each actor is one row; the unique event key keeps
  // one alert per recipient.
  const candidates = ctx.db
    .select({
      id: sql<string>`uuidv7()`.as("id"),
      organizationId: actors.organizationId,
      recipientActorEntityId: actors.entityId,
      kind: kind.as("kind"),
      eventKey: sql<string>`${target.eventKey}::text`.as("event_key"),
      entityId: sql<string | null>`${"entityId" in target ? target.entityId : null}::uuid`.as(
        "entity_id",
      ),
      messageId: sql<string | null>`${"messageId" in target ? target.messageId : null}::uuid`.as(
        "message_id",
      ),
      readAt: (seenBy.length
        ? sql<Date | null>`CASE WHEN ${inArray(actors.entityId, seenBy)} THEN now() END`
        : sql<Date | null>`NULL::timestamptz`
      ).as("read_at"),
      createdAt: sql<Date>`now()`.as("created_at"),
    })
    .from(actors)
    .innerJoin(user, and(eq(user.id, actors.userId), eq(user.emailVerified, true)))
    .innerJoin(
      entities,
      and(
        eq(entities.entityId, actors.entityId),
        eq(entities.organizationId, actors.organizationId),
      ),
    )
    .where(
      and(
        eq(actors.type, "human"),
        activeActorCondition(),
        isNull(entities.deletedAt),
        or(
          actorIds.length ? inArray(actors.entityId, actorIds) : undefined,
          userIds.length ? inArray(actors.userId, userIds) : undefined,
        ),
        "entityId" in target
          ? and(
              eq(actors.organizationId, ctx.scope.organizationId),
              actorIds.length
                ? and(
                    inArray(actors.entityId, actorIds),
                    readableCondition(
                      { organizationId: ctx.scope.organizationId, actorEntityId: actors.entityId },
                      sql`${target.entityId}::uuid`,
                    ),
                  )
                : sql`false`,
            )
          : sql`EXISTS (SELECT 1 FROM ${messagingConversations}
            LEFT JOIN ${messagingParticipants} ON ${messagingParticipants.conversationId} = ${messagingConversations.id}
              AND ${messagingParticipants.actorEntityId} = ${actors.entityId}
            WHERE ${messagingConversations.id} = ${target.conversationId}::uuid
              AND ${visibleConversations(ctx.db, { userId: actors.userId, organizationId: actors.organizationId })}
              AND (${actors.organizationId} = ${target.conversationOrganizationId}
                OR ${messagingParticipants.actorEntityId} IS NOT NULL))`,
      ),
    );
  return ctx.effects.notify(async () =>
    (
      await ctx.db.insert(notifications).select(candidates).onConflictDoNothing().returning({
        organizationId: notifications.organizationId,
        actorId: notifications.recipientActorEntityId,
        readAt: notifications.readAt,
      })
    ).flatMap(({ readAt, ...row }) => (readAt ? [] : [row])),
  );
}
