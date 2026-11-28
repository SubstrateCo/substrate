import {
  interactionDirectory,
  type InteractionDirectory,
} from "@substrate/contracts/context/interactions";

import { requireAppEnabled } from "../../../core/apps/access";
import { parseInput } from "../../../core/contacts/inputs";
import { readableInteractionPeriod } from "../../../core/contacts/interactions/interaction-workspace.repository";
import { contactInteractions } from "../../../core/contacts/interactions/interactions.schema";
import { contacts } from "../../../core/contacts/schema";
import type { RepositoryContext } from "../../../core/repository-context";
import { interactionScope } from "../../crm/activity/timeline";
import { crmAccounts } from "../../crm/schema";
import { interactionCalendarFilter } from "./interaction-calendar-filter";
import { and, asc, desc, eq, ilike, sql } from "drizzle-orm";

export async function interactionDirectoryPage(
  context: RepositoryContext,
  input: InteractionDirectory,
) {
  const value = parseInput(interactionDirectory, input);
  const pageSize = value.pageSize ?? 25;
  const { db } = context;
  const count = sql<number>`count(distinct ${contactInteractions.entityId})`.mapWith(Number);
  const last = sql<Date>`max(${contactInteractions.occurredAt})`;
  const pattern = value.search ? `%${value.search.replace(/[\\%_]/g, "\\$&")}%` : undefined;
  const table = value.type === "people" ? contacts : crmAccounts;
  const name = value.type === "people" ? contacts.displayName : crmAccounts.name;
  let order = desc(last);
  if (value.sort === "name") order = asc(name);
  if (value.sort === "count") order = desc(count);
  if (value.type === "accounts") await requireAppEnabled(context, "crm");
  let countCondition;
  if (value.countOperator === "less than") countCondition = sql`${count} < ${value.count}`;
  if (value.countOperator === "equal to") countCondition = sql`${count} = ${value.count}`;
  if (value.countOperator === "greater than") countCondition = sql`${count} > ${value.count}`;
  if (value.countOperator === "between")
    countCondition = sql`${count} between ${value.count} and ${value.countUntil}`;
  const rows = await db
    .select({
      entityId: table.entityId,
      name,
      count,
      contacts: sql<number>`count(distinct ${contactInteractions.contactEntityId})`.mapWith(Number),
      last,
    })
    .from(table)
    .innerJoin(
      contactInteractions,
      value.type === "people"
        ? eq(contactInteractions.contactEntityId, contacts.entityId)
        : interactionScope(context, "account", crmAccounts.entityId),
    )
    .where(
      and(
        eq(table.organizationId, context.scope.organizationId),
        context.readable(table.entityId),
        readableInteractionPeriod(context, value),
        interactionCalendarFilter(context, value.sourceCalendarEntityId),
        pattern ? ilike(name, pattern) : undefined,
      ),
    )
    .groupBy(table.entityId, name)
    .having(and(countCondition, value.repeat ? sql`${count} >= 2` : undefined))
    .orderBy(order, asc(table.entityId))
    .offset(value.offset ?? 0)
    .limit(pageSize + 1);
  return { items: rows.slice(0, pageSize), more: rows.length > pageSize };
}
