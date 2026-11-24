import {
  contextEntityTypes,
  contextTargetTypes,
  type ContextEntityType,
  type ContextTargetType,
} from "@substrate/contracts/context/input";

import { contactInteractions } from "../../core/contacts/interactions/interactions.schema";
import { contacts } from "../../core/contacts/schema";
import { entities } from "../../core/entities/schema";
import type { RepositoryContext } from "../../core/repository-context";
import { AccessDeniedError } from "../../errors";
import { calendarEvents } from "../calendar/schema";
import { crmAccounts, crmDeals } from "../crm/schema";
import { projects } from "../projects/schema";
import { tasks } from "../tasks/tasks.schema";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";

type ContextTarget<T extends ContextTargetType> = {
  entityType: T;
  title: string;
  projectEntityId: string | null;
  contactEntityId: string | null;
};

/** Every record a context view shows as related, including the meetings a reader can open. */
export function requireReadableTargetPage(ctx: RepositoryContext, entityIds: string[]) {
  return targetPage<ContextTargetType>(ctx, entityIds, contextTargetTypes);
}

/** Linkable records the reader can open. Records they cannot open are left out. */
export function contextTargetsOf(ctx: RepositoryContext, entityIds: string[]) {
  return targetRows<ContextEntityType>(ctx, entityIds, contextEntityTypes);
}

async function targetPage<T extends ContextTargetType>(
  ctx: RepositoryContext,
  entityIds: string[],
  types: readonly T[],
): Promise<Map<string, ContextTarget<T>>> {
  const rows = await targetRows(ctx, entityIds, types);
  if (rows.size !== new Set(entityIds).size) throw new AccessDeniedError();
  return rows;
}

async function targetRows<T extends ContextTargetType>(
  ctx: RepositoryContext,
  entityIds: string[],
  types: readonly T[],
): Promise<Map<string, ContextTarget<T>>> {
  const ids = [...new Set(entityIds)];
  if (!ids.length) return new Map<string, ContextTarget<T>>();
  await ctx.requireActiveActor();
  const meetingTitle = sql`CASE WHEN ${calendarEvents.entityId} IS NOT NULL
    THEN coalesce(nullif(btrim(${calendarEvents.title}), ''), 'Untitled meeting') END`;
  const title = sql<string>`coalesce(${tasks.title}, ${projects.name}, ${contacts.displayName}, ${crmAccounts.name}, ${crmDeals.title}, ${contactInteractions.summary}, ${meetingTitle})`;
  const rows = await ctx.db
    .select({
      id: entities.entityId,
      entityType: sql<T>`${entities.entityType}`,
      title,
      projectEntityId: tasks.projectEntityId,
      contactEntityId: contactInteractions.contactEntityId,
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
    .leftJoin(
      calendarEvents,
      and(
        eq(calendarEvents.organizationId, entities.organizationId),
        eq(calendarEvents.entityId, entities.entityId),
        eq(entities.entityType, "calendar_event"),
      ),
    )
    .where(
      and(
        eq(entities.organizationId, ctx.scope.organizationId),
        inArray(entities.entityId, ids),
        inArray(entities.entityType, types),
        ctx.readable(entities.entityId),
        isNotNull(title),
      ),
    );
  return new Map(rows.map((row) => [row.id, row]));
}
