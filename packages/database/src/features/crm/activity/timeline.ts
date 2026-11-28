import type { CrmTimelineMode } from "@substrate/contracts/crm/input";

import { requireAppEnabled } from "../../../core/apps/access";
import { contactInteractionRepository } from "../../../core/contacts/interactions/interactions.repository";
import { contactInteractions } from "../../../core/contacts/interactions/interactions.schema";
import { relatedLink } from "../../../core/links/repository";
import { entityLinks } from "../../../core/links/schema";
import type { RepositoryContext } from "../../../core/repository-context";
import { pageSize } from "../../../core/repository-context";
import { AccessDeniedError, ValidationError } from "../../../errors";
import { crmAffiliations, crmDealContacts } from "../schema";
import { presentInteractions } from "./actor-views";
import { and, eq, exists, inArray, or, sql, type SQLWrapper } from "drizzle-orm";

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
          relatedLink(entityId, contactInteractions.entityId),
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

async function scopeMembers(
  context: RepositoryContext,
  entityType: "account" | "deal",
  entityId: string,
  linkedOnly: boolean,
) {
  const { db, scope } = context;
  const links = and(
    eq(entityLinks.organizationId, scope.organizationId),
    eq(entityLinks.relationType, "related_to"),
  );
  const linked = await db
    .select({ id: entityLinks.targetEntityId })
    .from(entityLinks)
    .where(and(links, eq(entityLinks.sourceEntityId, entityId)))
    .union(
      db
        .select({ id: entityLinks.sourceEntityId })
        .from(entityLinks)
        .where(and(links, eq(entityLinks.targetEntityId, entityId))),
    );
  const interactionIds = linked.map((row) => row.id);
  if (linkedOnly) return { contactIds: [], interactionIds };
  const contactRows =
    entityType === "account"
      ? await db
          .select({ id: crmAffiliations.contactEntityId })
          .from(crmAffiliations)
          .where(
            and(
              eq(crmAffiliations.organizationId, scope.organizationId),
              eq(crmAffiliations.accountEntityId, entityId),
            ),
          )
      : await db
          .select({ id: crmDealContacts.contactEntityId })
          .from(crmDealContacts)
          .where(
            and(
              eq(crmDealContacts.organizationId, scope.organizationId),
              eq(crmDealContacts.dealEntityId, entityId),
            ),
          );
  return { contactIds: contactRows.map((row) => row.id), interactionIds };
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
      await contactInteractionRepository(context).listForContact(
        entityId,
        { limit: options.limit, before },
        access,
      ),
    );
  if (entity.entityType !== "account" && entity.entityType !== "deal")
    throw new AccessDeniedError();
  const { db, scope } = context;
  const { contactIds, interactionIds } = await scopeMembers(
    context,
    entity.entityType,
    entityId,
    options.mode === "linked",
  );
  if (!contactIds.length && !interactionIds.length) return [];
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
        context.readable(contactInteractions.entityId, "view", "contact_interaction"),
        or(
          contactIds.length ? inArray(contactInteractions.contactEntityId, contactIds) : undefined,
          interactionIds.length ? inArray(contactInteractions.entityId, interactionIds) : undefined,
        ),
        before
          ? sql`(${contactInteractions.occurredAt}, ${contactInteractions.entityId}) < (${before.occurredAt.toISOString()}::timestamptz, ${before.entityId}::uuid)`
          : undefined,
      ),
    )
    .orderBy(
      sql`${contactInteractions.occurredAt} desc nulls last`,
      sql`${contactInteractions.entityId} desc nulls last`,
    )
    .limit(pageSize(options.limit));
}
