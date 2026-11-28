import type { CrmActivity } from "@substrate/contracts/crm/activity";

import { actors } from "../../../core/actors/schema";
import { userAgents } from "../../../core/actors/user-agents.schema";
import { user } from "../../../core/authentication/schema";
import { deletableAuthorCondition } from "../../../core/contacts/access";
import type { RepositoryContext } from "../../../core/repository-context";
import { and, eq, inArray, sql } from "drizzle-orm";
import { alias, type PgSelectQueryBuilder } from "drizzle-orm/pg-core";

export function joinCrmActorPerson<T extends PgSelectQueryBuilder>(query: T) {
  const person = alias(actors, "crm_actor_person");
  return query
    .leftJoin(userAgents, and(eq(actors.type, "agent"), eq(userAgents.id, actors.userAgentId)))
    .leftJoin(
      person,
      and(
        eq(person.organizationId, actors.organizationId),
        eq(person.type, "human"),
        eq(person.userId, sql`coalesce(${actors.userId}, ${userAgents.userId})`),
      ),
    )
    .leftJoin(user, eq(user.id, person.userId));
}

export function crmActorView(
  type: CrmActivity["actor"]["type"],
  personName: string | null,
): CrmActivity["actor"] {
  return {
    type,
    displayName:
      type === "agent"
        ? `Agent on behalf of ${personName ?? "a former member"}`
        : (personName ?? "Former member"),
  };
}

async function crmActorViews(context: RepositoryContext, ids: string[]) {
  const views = new Map<string, CrmActivity["actor"]>();
  const deletable = new Set<string>();
  if (!ids.length) return { views, deletable };
  const rows = await joinCrmActorPerson(
    context.db
      .select({
        id: actors.entityId,
        type: actors.type,
        personName: user.name,
        deletable: sql<boolean>`${deletableAuthorCondition(context, actors.entityId)}`,
      })
      .from(actors)
      .$dynamic(),
  ).where(
    and(
      eq(actors.organizationId, context.scope.organizationId),
      inArray(actors.entityId, [...new Set(ids)]),
    ),
  );
  for (const row of rows) {
    views.set(row.id, crmActorView(row.type, row.personName));
    if (row.deletable) deletable.add(row.id);
  }
  return { views, deletable };
}

export async function presentInteractions<T extends { createdByActorEntityId: string }>(
  context: RepositoryContext,
  rows: T[],
) {
  const authors = rows.map((row) => row.createdByActorEntityId);
  const { views, deletable } = await crmActorViews(context, authors);
  return rows.map(({ createdByActorEntityId, ...row }) => ({
    ...row,
    actor: views.get(createdByActorEntityId) ?? {
      type: "human" as const,
      displayName: "Former member",
    },
    canDelete: deletable.has(createdByActorEntityId),
  }));
}
export async function presentInteraction<T extends { createdByActorEntityId: string }>(
  context: RepositoryContext,
  row: T,
) {
  return (await presentInteractions(context, [row]))[0]!;
}
