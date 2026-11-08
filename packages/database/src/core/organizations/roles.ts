import type { DatabaseExecutor } from "../../client";
import { member } from "./schema";
import { and, eq, sql, type SQLWrapper } from "drizzle-orm";

// Better Auth stores several roles as a comma-separated list. Owners and admins are super users.
export function adminRoleCondition(role: SQLWrapper) {
  return sql`string_to_array(${role}, ',') && ARRAY['owner', 'admin']`;
}

export async function isOrganizationAdmin(
  db: DatabaseExecutor,
  userId: string,
  organizationId: string,
) {
  const [row] = await db
    .select({ id: member.id })
    .from(member)
    .where(
      and(
        eq(member.userId, userId),
        eq(member.organizationId, organizationId),
        adminRoleCondition(member.role),
      ),
    );
  return !!row;
}
