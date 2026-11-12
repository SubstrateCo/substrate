import type { CrmActivity } from "@substrate/contracts/crm/activity";

import { actors } from "../../core/actors/schema";
import { userAgents } from "../../core/actors/user-agents.schema";
import { user } from "../../core/authentication/schema";
import type { RepositoryContext } from "../../core/repository-context";
import { and, eq, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

export async function crmActorViews(context: RepositoryContext, ids: string[]) {
  const views = new Map<string, CrmActivity["actor"]>();
  if (!ids.length) return views;
  const person = alias(actors, "crm_attribution_person");
  const rows = await context.db
    .select({ id: actors.entityId, type: actors.type, personName: user.name })
    .from(actors)
    .leftJoin(userAgents, and(eq(actors.type, "agent"), eq(userAgents.id, actors.userAgentId)))
    .leftJoin(
      person,
      and(
        eq(person.organizationId, actors.organizationId),
        eq(person.type, "human"),
        eq(person.userId, sql`coalesce(${actors.userId}, ${userAgents.userId})`),
      ),
    )
    .leftJoin(user, eq(user.id, person.userId))
    .where(
      and(
        eq(actors.organizationId, context.scope.organizationId),
        inArray(actors.entityId, [...new Set(ids)]),
      ),
    );
  for (const row of rows)
    views.set(row.id, {
      type: row.type,
      displayName:
        row.type === "agent"
          ? `Agent on behalf of ${row.personName ?? "a former member"}`
          : (row.personName ?? "Former member"),
    });
  return views;
}

export async function presentInteractions<T extends { createdByActorEntityId: string }>(
  context: RepositoryContext,
  rows: T[],
) {
  const views = await crmActorViews(
    context,
    rows.map((row) => row.createdByActorEntityId),
  );
  return rows.map(({ createdByActorEntityId, ...row }) => ({
    ...row,
    actor: views.get(createdByActorEntityId) ?? {
      type: "human" as const,
      displayName: "Former member",
    },
  }));
}
export async function presentInteraction<T extends { createdByActorEntityId: string }>(
  context: RepositoryContext,
  row: T,
) {
  return (await presentInteractions(context, [row]))[0]!;
}
