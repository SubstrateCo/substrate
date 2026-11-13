import { actors } from "../../core/actors/schema";
import { user } from "../../core/authentication/schema";
import { entities } from "../../core/entities/schema";
import { member } from "../../core/organizations/schema";
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
export async function notify(
  ctx: RepositoryContext,
  groups: { kind: Kind; recipients: Recipient[] }[],
  target: Target,
) {
  const recipients = groups.flatMap((group) => group.recipients);
  if (!recipients.length) return [];
  const actorIds = recipients.flatMap((row) => ("actorEntityId" in row ? [row.actorEntityId] : []));
  const userIds = recipients.flatMap((row) => ("userId" in row ? [row.userId] : []));
  const candidates = await ctx.db
    .selectDistinct({
      organizationId: actors.organizationId,
      actorId: actors.entityId,
      userId: actors.userId,
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
    .innerJoin(
      member,
      and(eq(member.userId, user.id), eq(member.organizationId, actors.organizationId)),
    )
    .where(
      and(
        eq(actors.type, "human"),
        isNull(actors.disabledAt),
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
  // Entity targets reach recipients only by actor.
  const names = (recipient: Recipient, row: (typeof candidates)[number]) =>
    "actorEntityId" in recipient
      ? recipient.actorEntityId === row.actorId
      : !("entityId" in target) && recipient.userId === row.userId;
  const values = candidates.flatMap((row) => {
    const group = groups.find((entry) => entry.recipients.some((item) => names(item, row)));
    return group
      ? [
          {
            organizationId: row.organizationId,
            recipientActorEntityId: row.actorId,
            kind: group.kind,
            eventKey: target.eventKey,
            entityId: "entityId" in target ? target.entityId : undefined,
            messageId: "messageId" in target ? target.messageId : undefined,
          },
        ]
      : [];
  });
  if (!values.length) return [];
  return ctx.effects.notify(() =>
    ctx.db.insert(notifications).values(values).onConflictDoNothing().returning({
      organizationId: notifications.organizationId,
      actorId: notifications.recipientActorEntityId,
    }),
  );
}
