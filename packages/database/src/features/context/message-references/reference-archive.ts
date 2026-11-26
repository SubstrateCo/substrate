import { inArchivedProject } from "../../projects/archive";
import { sql, type SQLWrapper } from "drizzle-orm";

/**
 * The entities whose archive blocks a change to a message reference: the work, and the task
 * whose discussion holds the message. detachReference rejects through requireUnarchived on these
 * IDs, and messageWorkLinks' canRemove tests the same entities with referenceArchived, so the
 * flag and the write must agree.
 */
export function referenceArchiveIds(workEntityId: string, taskEntityId: string | null) {
  return [workEntityId, ...(taskEntityId ? [taskEntityId] : [])];
}

/** SQL form of referenceArchiveIds: the work or the discussion's task is in an archived project. */
export function referenceArchived(
  organizationId: SQLWrapper,
  workEntityId: SQLWrapper,
  taskEntityId: SQLWrapper,
) {
  // A NULL task matches no entity, so a channel message tests only its work.
  return sql`(${inArchivedProject(organizationId, workEntityId)}
    OR ${inArchivedProject(organizationId, taskEntityId)})`;
}
