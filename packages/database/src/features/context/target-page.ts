import { contextEntityTypes, type ContextEntityType } from "@substrate/contracts/context/input";

import { contactInteractions } from "../../core/contacts/interactions.schema";
import { contacts } from "../../core/contacts/schema";
import { entities } from "../../core/entities/schema";
import type { RepositoryContext } from "../../core/repository-context";
import { AccessDeniedError } from "../../errors";
import { crmAccounts, crmDeals } from "../crm/schema";
import { projects } from "../projects/schema";
import { tasks } from "../tasks/tasks.schema";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";

export async function requireContextTargetPage(ctx: RepositoryContext, entityIds: string[]) {
  const ids = [...new Set(entityIds)];
  if (!ids.length) return new Map<string, { entityType: ContextEntityType; title: string }>();
  await ctx.requireActiveActor();
  const title = sql<string>`coalesce(${tasks.title}, ${projects.name}, ${contacts.displayName}, ${crmAccounts.name}, ${crmDeals.title}, ${contactInteractions.summary})`;
  const rows = await ctx.db
    .select({
      id: entities.entityId,
      entityType: sql<ContextEntityType>`${entities.entityType}`,
      title,
    })
    .from(entities)
    .leftJoin(
      tasks,
      and(
        eq(tasks.organizationId, entities.organizationId),
        eq(tasks.entityId, entities.entityId),
        eq(entities.entityType, "task"),
      ),
    )
    .leftJoin(
      projects,
      and(
        eq(projects.organizationId, entities.organizationId),
        eq(projects.entityId, entities.entityId),
        eq(entities.entityType, "project"),
      ),
    )
    .leftJoin(
      contacts,
      and(
        eq(contacts.organizationId, entities.organizationId),
        eq(contacts.entityId, entities.entityId),
        eq(entities.entityType, "contact"),
      ),
    )
    .leftJoin(
      crmAccounts,
      and(
        eq(crmAccounts.organizationId, entities.organizationId),
        eq(crmAccounts.entityId, entities.entityId),
        eq(entities.entityType, "account"),
      ),
    )
    .leftJoin(
      crmDeals,
      and(
        eq(crmDeals.organizationId, entities.organizationId),
        eq(crmDeals.entityId, entities.entityId),
        eq(entities.entityType, "deal"),
      ),
    )
    .leftJoin(
      contactInteractions,
      and(
        eq(contactInteractions.organizationId, entities.organizationId),
        eq(contactInteractions.entityId, entities.entityId),
        eq(entities.entityType, "contact_interaction"),
      ),
    )
    .where(
      and(
        eq(entities.organizationId, ctx.scope.organizationId),
        inArray(entities.entityId, ids),
        inArray(entities.entityType, contextEntityTypes),
        ctx.readable(entities.entityId),
        isNotNull(title),
      ),
    );
  if (rows.length !== ids.length) throw new AccessDeniedError();
  return new Map(rows.map((row) => [row.id, row]));
}
