import { contactInteractionRepository } from "../../core/contacts/interactions.repository";
import { contactInteractions } from "../../core/contacts/interactions.schema";
import { entityLinks } from "../../core/links/schema";
import type { RepositoryContext } from "../../core/repository-context";
import { pageSize } from "../../core/repository-context";
import { AccessDeniedError, ValidationError } from "../../errors";
import { presentInteractions } from "./actor-views";
import { crmAffiliations, crmDealContacts } from "./schema";
import { and, desc, eq, exists, or, sql } from "drizzle-orm";

type Options = {
  limit?: number;
  beforeOccurredAt?: string;
  beforeEntityId?: string;
  mode?: "participants" | "linked";
};
export async function timeline(
  context: RepositoryContext,
  entityId: string,
  options: Options = {},
) {
  const { entity } = await context.requireAccess(entityId, "view");
  if (Boolean(options.beforeOccurredAt) !== Boolean(options.beforeEntityId))
    throw new ValidationError("Supply both timeline cursor fields.");
  const before =
    options.beforeOccurredAt && options.beforeEntityId
      ? { occurredAt: new Date(options.beforeOccurredAt), entityId: options.beforeEntityId }
      : undefined;
  if (entity.entityType === "contact")
    return presentInteractions(
      context,
      await contactInteractionRepository(context).listForContact(entityId, {
        limit: options.limit,
        before,
      }),
    );
  if (entity.entityType !== "account" && entity.entityType !== "deal")
    throw new AccessDeniedError();
  const { db, scope } = context;
  const structural =
    entity.entityType === "account"
      ? exists(
          db
            .select({ one: sql`1` })
            .from(crmAffiliations)
            .where(
              and(
                eq(crmAffiliations.organizationId, scope.organizationId),
                eq(crmAffiliations.accountEntityId, entityId),
                eq(crmAffiliations.contactEntityId, contactInteractions.contactEntityId),
              ),
            ),
        )
      : exists(
          db
            .select({ one: sql`1` })
            .from(crmDealContacts)
            .where(
              and(
                eq(crmDealContacts.organizationId, scope.organizationId),
                eq(crmDealContacts.dealEntityId, entityId),
                eq(crmDealContacts.contactEntityId, contactInteractions.contactEntityId),
              ),
            ),
        );
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
        context.readable(contactInteractions.entityId),
        context.readable(contactInteractions.contactEntityId),
        options.mode === "linked" ? linked : or(structural, linked),
        before
          ? sql`(${contactInteractions.occurredAt}, ${contactInteractions.entityId}) < (${before.occurredAt.toISOString()}::timestamptz, ${before.entityId}::uuid)`
          : undefined,
      ),
    )
    .orderBy(desc(contactInteractions.occurredAt), desc(contactInteractions.entityId))
    .limit(pageSize(options.limit));
}
