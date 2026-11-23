import type { CrmTimelineMode } from "@substrate/contracts/crm/input";

import { requireAppEnabled } from "../../core/apps/access";
import { interactionReadable } from "../../core/contacts/access";
import { contactInteractionRepository } from "../../core/contacts/interactions/interactions.repository";
import { contactInteractions } from "../../core/contacts/interactions/interactions.schema";
import { entityLinks } from "../../core/links/schema";
import type { RepositoryContext } from "../../core/repository-context";
import { pageSize } from "../../core/repository-context";
import { AccessDeniedError, ValidationError } from "../../errors";
import { presentInteractions } from "./actor-views";
import { crmAffiliations, crmDealContacts } from "./schema";
import { and, desc, eq, exists, or, sql, type SQLWrapper } from "drizzle-orm";

type Options = {
  limit?: number;
  beforeOccurredAt?: string;
  beforeEntityId?: string;
  mode?: CrmTimelineMode;
};

export function interactionScope(
  context: RepositoryContext,
  entityType: "account" | "deal",
  entityId: string | SQLWrapper,
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
              eq(entityLinks.sourceEntityId, entityId),
              eq(entityLinks.targetEntityId, contactInteractions.entityId),
            ),
            and(
              eq(entityLinks.targetEntityId, entityId),
              eq(entityLinks.sourceEntityId, contactInteractions.entityId),
            ),
          ),
        ),
      ),
  );
  if (linkedOnly) return linked;
  const table = entityType === "account" ? crmAffiliations : crmDealContacts;
  return or(
    linked,
    exists(
      db
        .select({ one: sql`1` })
        .from(table)
        .where(
          and(
            eq(table.organizationId, scope.organizationId),
            eq(
              entityType === "account"
                ? crmAffiliations.accountEntityId
                : crmDealContacts.dealEntityId,
              entityId,
            ),
            eq(table.contactEntityId, contactInteractions.contactEntityId),
          ),
        ),
    ),
  )!;
}

export async function timeline(
  context: RepositoryContext,
  entityId: string,
  options: Options = {},
) {
  await requireAppEnabled(context, "crm");
  const access = await context.requireAccess(entityId, "view");
  const { entity } = access;
  if (Boolean(options.beforeOccurredAt) !== Boolean(options.beforeEntityId))
    throw new ValidationError("Supply both timeline cursor fields.");
  const before =
    options.beforeOccurredAt && options.beforeEntityId
      ? { occurredAt: new Date(options.beforeOccurredAt), entityId: options.beforeEntityId }
      : undefined;
  if (entity.entityType === "contact")
    return presentInteractions(
      context,
      // View access on a live contact implies requireContact: an active member.
      await contactInteractionRepository(context).listForContact(
        entityId,
        { limit: options.limit, before },
        access,
      ),
    );
  if (entity.entityType !== "account" && entity.entityType !== "deal")
    throw new AccessDeniedError();
  const { db, scope } = context;
  // A rollup is one row per canonical interaction. It does not copy source identifiers or private
  // previews; navigation to discussion anchors is independently resolved by the context domain.
  return db
    .select({
      entityId: contactInteractions.entityId,
      contactEntityId: contactInteractions.contactEntityId,
      kind: contactInteractions.kind,
      occurredAt: contactInteractions.occurredAt,
      endedAt: contactInteractions.endedAt,
      summary: contactInteractions.summary,
      origin: contactInteractions.origin,
    })
    .from(contactInteractions)
    .where(
      and(
        eq(contactInteractions.organizationId, scope.organizationId),
        interactionReadable(context, contactInteractions.entityId),
        interactionScope(context, entity.entityType, entityId, options.mode === "linked"),
        before
          ? sql`(${contactInteractions.occurredAt}, ${contactInteractions.entityId}) < (${before.occurredAt.toISOString()}::timestamptz, ${before.entityId}::uuid)`
          : undefined,
      ),
    )
    .orderBy(desc(contactInteractions.occurredAt), desc(contactInteractions.entityId))
    .limit(pageSize(options.limit));
}
