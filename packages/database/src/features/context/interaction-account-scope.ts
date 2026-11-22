import { contactInteractions } from "../../core/contacts/interactions.schema";
import { entityLinks } from "../../core/links/schema";
import type { RepositoryContext } from "../../core/repository-context";
import { crmAffiliations } from "../crm/schema";
import { and, eq, exists, or, sql, type SQLWrapper } from "drizzle-orm";

export function interactionAccountScope(
  context: RepositoryContext,
  id: string | SQLWrapper,
  linkedOnly = false,
) {
  const { db, scope } = context;
  const linked = exists(
    db
      .select({ one: sql`1` })
      .from(entityLinks)
      .where(
        and(
          eq(entityLinks.organizationId, scope.organizationId),
          eq(entityLinks.relationType, "related_to"),
          or(
            and(
              eq(entityLinks.sourceEntityId, id),
              eq(entityLinks.targetEntityId, contactInteractions.entityId),
            ),
            and(
              eq(entityLinks.targetEntityId, id),
              eq(entityLinks.sourceEntityId, contactInteractions.entityId),
            ),
          ),
        ),
      ),
  );
  if (linkedOnly) return linked;
  return or(
    linked,
    exists(
      db
        .select({ one: sql`1` })
        .from(crmAffiliations)
        .where(
          and(
            eq(crmAffiliations.organizationId, scope.organizationId),
            eq(crmAffiliations.accountEntityId, id),
            eq(crmAffiliations.contactEntityId, contactInteractions.contactEntityId),
          ),
        ),
    ),
  )!;
}
