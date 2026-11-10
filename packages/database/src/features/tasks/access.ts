import { entities } from "../../core/entities/schema";
import { tasks } from "./tasks.schema";
import { sql, type SQLWrapper } from "drizzle-orm";

// Tasks have no access of their own. A task's level is its project's level while the task
// entity is not deleted. Callers check the project; this checks the task.
export function liveTask(entityId: SQLWrapper = tasks.entityId) {
  return sql`EXISTS (SELECT 1 FROM ${entities} lt
    WHERE lt.organization_id = ${tasks.organizationId} AND lt.entity_id = ${entityId}
      AND lt.deleted_at IS NULL)`;
}
