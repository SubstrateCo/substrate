import {
  interactionPeriod,
  interactionTimeline,
  type InteractionPeriod,
  type InteractionTimeline,
} from "@substrate/contracts/context/interactions";

import type { RepositoryContext } from "../../repository-context";
import { parseInput } from "../inputs";
import { contacts } from "../schema";
import { contactInteractions } from "./interactions.schema";
import { and, desc, eq, getTableColumns, gte, ilike, lt, or, sql, type SQL } from "drizzle-orm";

export const readableInteractionPeriod = (
  context: RepositoryContext,
  input: InteractionPeriod & { allTime?: "true" },
) =>
  and(
    eq(contactInteractions.organizationId, context.scope.organizationId),
    input.allTime ? undefined : gte(contactInteractions.occurredAt, new Date(input.from)),
    input.allTime ? undefined : lt(contactInteractions.occurredAt, new Date(input.until)),
    context.readable(contactInteractions.entityId, "view", "contact_interaction"),
  );

export function interactionWorkspaceRepository(context: RepositoryContext) {
  const { db } = context;
  return {
    async workspaceActivity(input: InteractionPeriod) {
      const value = parseInput(interactionPeriod, input);
      const condition = readableInteractionPeriod(context, value);
      const [summary] = await db
        .select({
          total: sql<number>`count(*)`.mapWith(Number),
          contacts: sql<number>`count(distinct ${contactInteractions.contactEntityId})`.mapWith(
            Number,
          ),
          meetingsAndCalls:
            sql<number>`count(*) filter (where ${contactInteractions.kind} in ('meeting', 'call'))`.mapWith(
              Number,
            ),
          recordedMinutes:
            sql<number>`coalesce(sum(extract(epoch from (${contactInteractions.endedAt} - ${contactInteractions.occurredAt})) / 60) filter (where ${contactInteractions.kind} in ('meeting', 'call')), 0)`.mapWith(
              Number,
            ),
          published:
            sql<number>`count(*) filter (where ${contactInteractions.origin} = 'message_publication')`.mapWith(
              Number,
            ),
        })
        .from(contactInteractions)
        .where(condition);
      const day = sql<string>`to_char(${contactInteractions.occurredAt} at time zone ${value.timeZone}, 'YYYY-MM-DD')`;
      const activity = await db
        .select({
          day: day.as("day"),
          kind: contactInteractions.kind,
          count: sql<number>`count(*)`.mapWith(Number),
        })
        .from(contactInteractions)
        .where(condition)
        .groupBy(sql`"day"`, contactInteractions.kind)
        .orderBy(sql`"day"`);
      return { summary: summary!, activity };
    },
    async workspaceTimeline(input: InteractionTimeline, condition?: SQL) {
      const value = parseInput(interactionTimeline, input);
      const pattern = value.search ? `%${value.search.replace(/[\\%_]/g, "\\$&")}%` : undefined;
      const rows = await db
        .select({
          ...getTableColumns(contactInteractions),
          contactName: contacts.displayName,
        })
        .from(contactInteractions)
        .innerJoin(
          contacts,
          and(
            eq(contacts.organizationId, contactInteractions.organizationId),
            eq(contacts.entityId, contactInteractions.contactEntityId),
          ),
        )
        .where(
          and(
            readableInteractionPeriod(context, value),
            condition,
            value.contactEntityId
              ? eq(contactInteractions.contactEntityId, value.contactEntityId)
              : undefined,
            value.kind ? eq(contactInteractions.kind, value.kind) : undefined,
            value.origin ? eq(contactInteractions.origin, value.origin) : undefined,
            pattern
              ? or(
                  ilike(contacts.displayName, pattern),
                  ilike(contactInteractions.summary, pattern),
                )
              : undefined,
            value.beforeOccurredAt && value.beforeEntityId
              ? sql`(${contactInteractions.occurredAt}, ${contactInteractions.entityId}) < (${value.beforeOccurredAt}::timestamptz, ${value.beforeEntityId}::uuid)`
              : undefined,
          ),
        )
        .orderBy(desc(contactInteractions.occurredAt), desc(contactInteractions.entityId))
        .limit(51);
      const items = rows.slice(0, 50);
      const last = items.at(-1);
      return {
        items,
        nextCursor:
          rows.length > 50 && last
            ? { beforeOccurredAt: last.occurredAt.toISOString(), beforeEntityId: last.entityId }
            : null,
      };
    },
  };
}
