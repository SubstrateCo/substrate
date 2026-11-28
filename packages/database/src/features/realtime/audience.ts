import type { RealtimeAudience } from "@substrate/contracts/realtime";

import { activeActorCondition } from "../../core/actors/access";
import { actors } from "../../core/actors/schema";
import { user } from "../../core/authentication/schema";
import { entities } from "../../core/entities/schema";
import type { DatabaseExecutor } from "../../core/executor";
import { entityReaders } from "../../core/permissions/visibility";
import { conversationReaders } from "../messaging/access";
import { and, eq, inArray, isNull, or } from "drizzle-orm";

declare const resolved: unique symbol;

/** Only resolveReceiver creates one, so audience filters see a checked identity. */
export interface RealtimeReceiver {
  userId: string;
  organizationId: string | null;
  actorId: string | null;
  readonly [resolved]: true;
}

export type ReceiverIdentity = Pick<RealtimeReceiver, "userId" | "organizationId">;

// SAFETY: the brand is type-only; resolveReceiver calls this after its checks pass.
const receiver = (value: Omit<RealtimeReceiver, typeof resolved>) => value as RealtimeReceiver;

export async function resolveReceiver(
  db: DatabaseExecutor,
  identity: ReceiverIdentity,
): Promise<RealtimeReceiver | null> {
  const [resolved] = await resolveReceivers(db, [identity]);
  return resolved ?? null;
}

export async function resolveReceivers(
  db: DatabaseExecutor,
  identities: readonly ReceiverIdentity[],
): Promise<(RealtimeReceiver | null)[]> {
  const accounts = [
    ...new Set(
      identities.flatMap((identity) => (identity.organizationId ? [] : [identity.userId])),
    ),
  ];
  const workspaces = [
    ...new Map(
      identities.flatMap(({ userId, organizationId }) =>
        organizationId
          ? [[JSON.stringify([organizationId, userId]), { userId, organizationId }]]
          : [],
      ),
    ).values(),
  ];
  const verified = new Set(
    accounts.length
      ? (
          await db
            .select({ id: user.id })
            .from(user)
            .where(and(inArray(user.id, accounts), eq(user.emailVerified, true)))
        ).map((viewer) => viewer.id)
      : [],
  );
  const actorIds = new Map(
    workspaces.length
      ? (
          await db
            .select({
              id: actors.entityId,
              organizationId: actors.organizationId,
              userId: actors.userId,
            })
            .from(actors)
            .innerJoin(
              entities,
              and(
                eq(entities.entityId, actors.entityId),
                eq(entities.organizationId, actors.organizationId),
              ),
            )
            .innerJoin(user, and(eq(user.id, actors.userId), eq(user.emailVerified, true)))
            .where(
              and(
                or(
                  ...workspaces.map((identity) =>
                    and(
                      eq(actors.organizationId, identity.organizationId),
                      eq(actors.userId, identity.userId),
                    ),
                  ),
                ),
                eq(actors.type, "human"),
                isNull(entities.deletedAt),
                activeActorCondition(),
              ),
            )
        ).map((actor) => [JSON.stringify([actor.organizationId, actor.userId]), actor.id])
      : [],
  );
  return identities.map(({ userId, organizationId }) => {
    if (!organizationId)
      return verified.has(userId)
        ? receiver({ userId, organizationId: null, actorId: null })
        : null;
    const actorId = actorIds.get(JSON.stringify([organizationId, userId]));
    return actorId ? receiver({ userId, organizationId, actorId }) : null;
  });
}

export type AudienceFilter = (receiver: RealtimeReceiver) => boolean;

export async function audienceRecipients(
  db: DatabaseExecutor,
  audience: Readonly<RealtimeAudience>,
): Promise<AudienceFilter> {
  const workspace = (receiver: RealtimeReceiver) =>
    receiver.organizationId !== null && receiver.actorId !== null;
  switch (audience[0]) {
    case "user":
      return (receiver) => receiver.userId === audience[1];
    case "organization":
      return (receiver) => workspace(receiver) && receiver.organizationId === audience[1];
    case "actor":
      return (receiver) =>
        workspace(receiver) &&
        receiver.organizationId === audience[1] &&
        receiver.actorId === audience[2];
    case "conversation": {
      const { publicIn, readers } = await conversationReaders(db, audience[1]);
      const members = new Set(
        readers.map((reader) => JSON.stringify([reader.userId, reader.organizationId])),
      );
      return (receiver) =>
        workspace(receiver) &&
        (receiver.organizationId === publicIn ||
          members.has(JSON.stringify([receiver.userId, receiver.organizationId])));
    }
    case "entity": {
      const [, organizationId, entityId] = audience;
      const rows = await db.execute<{ entity_id: string }>(entityReaders(organizationId, entityId));
      const readers = new Set(rows.map((row) => row.entity_id));
      return (receiver) =>
        workspace(receiver) &&
        receiver.organizationId === organizationId &&
        readers.has(receiver.actorId!);
    }
  }
}
