import { entities } from "../../core/entities/schema";
import type { DatabaseExecutor } from "../../core/executor";
import { notifications } from "./schema";
import { and, eq, exists, inArray, isNotNull, lt } from "drizzle-orm";

export async function deleteReadNotifications(
  db: DatabaseExecutor,
  createdBefore: Date,
  limit: number,
) {
  const deleted = await db
    .delete(notifications)
    .where(
      inArray(
        notifications.id,
        db
          .select({ id: notifications.id })
          .from(notifications)
          .where(and(isNotNull(notifications.readAt), lt(notifications.createdAt, createdBefore)))
          .limit(limit),
      ),
    )
    .returning({ id: notifications.id });
  return deleted.length;
}

/** Soft deletion does not cascade, and no restore exists, so these can never be shown again. */
export async function deleteNotificationsOfDeletedEntities(db: DatabaseExecutor, limit: number) {
  const deleted = await db
    .delete(notifications)
    .where(
      inArray(
        notifications.id,
        db
          .select({ id: notifications.id })
          .from(notifications)
          .where(
            exists(
              db
                .select({ id: entities.entityId })
                .from(entities)
                .where(
                  and(
                    eq(entities.organizationId, notifications.organizationId),
                    eq(entities.entityId, notifications.entityId),
                    isNotNull(entities.deletedAt),
                  ),
                ),
            ),
          )
          .limit(limit),
      ),
    )
    .returning({ id: notifications.id });
  return deleted.length;
}
