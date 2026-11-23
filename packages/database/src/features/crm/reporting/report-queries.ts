import { crmReportFilters } from "@substrate/contracts/crm/report-input";

import { interactionReadable } from "../../../core/contacts/access";
import { parseInput } from "../../../core/contacts/inputs";
import { contactInteractions } from "../../../core/contacts/interactions/interactions.schema";
import { entities } from "../../../core/entities/schema";
import { entityLinks } from "../../../core/links/schema";
import type { RepositoryContext } from "../../../core/repository-context";
import { tasks } from "../../tasks/tasks.schema";
import { crmDeals } from "../schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { z } from "zod";

export type ReportFilters = z.input<typeof crmReportFilters>;
export function reportQuery(context: RepositoryContext, input: ReportFilters = {}) {
  const value = parseInput(crmReportFilters, input);
  const asOf = value.asOf ?? new Date().toISOString();
  const today = asOf.slice(0, 10);
  const staleBefore = new Date(+new Date(asOf) - value.staleDays * 86400000).toISOString();
  const org = context.scope.organizationId;
  const nextActionDueDate = sql<string | null>`(select min(${tasks.dueDate})::text from ${tasks}
    where ${tasks.organizationId} = ${org} and ${tasks.status} not in ('completed','canceled')
      and ${context.readable(tasks.entityId)} and exists (
        select 1 from ${entityLinks} where ${entityLinks.organizationId} = ${org}
          and ${entityLinks.relationType} = 'related_to' and (
            (${entityLinks.sourceEntityId} = ${crmDeals.entityId} and ${entityLinks.targetEntityId} = ${tasks.entityId}) or
            (${entityLinks.targetEntityId} = ${crmDeals.entityId} and ${entityLinks.sourceEntityId} = ${tasks.entityId}))))`;
  const lastMeaningfulInteraction = sql`(select max(${contactInteractions.occurredAt}) from ${contactInteractions}
    where ${contactInteractions.organizationId} = ${org}
      and ${contactInteractions.kind} in ('email','meeting','call','message')
      and ${contactInteractions.occurredAt} <= ${asOf}::timestamptz
      and ${interactionReadable(context, contactInteractions.entityId)}
      and exists (select 1 from ${entityLinks} where ${entityLinks.organizationId} = ${org}
        and ${entityLinks.relationType} = 'related_to' and (
          (${entityLinks.sourceEntityId} = ${crmDeals.entityId} and ${entityLinks.targetEntityId} = ${contactInteractions.entityId}) or
          (${entityLinks.targetEntityId} = ${crmDeals.entityId} and ${entityLinks.sourceEntityId} = ${contactInteractions.entityId}))))`;
  const freshness = sql`coalesce(${lastMeaningfulInteraction}, (select ${entities.createdAt} from ${entities}
    where ${entities.organizationId} = ${org} and ${entities.entityId} = ${crmDeals.entityId}))`;
  const open = eq(crmDeals.outcome, "open");
  let currencyFilter;
  if (value.currency)
    currencyFilter =
      value.currency === "unknown"
        ? isNull(crmDeals.currency)
        : eq(crmDeals.currency, value.currency);
  const common = and(
    eq(crmDeals.organizationId, org),
    isNull(crmDeals.archivedAt),
    context.readable(crmDeals.entityId),
    value.stageId ? eq(crmDeals.stageId, value.stageId) : undefined,
    value.ownerActorEntityId
      ? eq(crmDeals.ownerActorEntityId, value.ownerActorEntityId)
      : undefined,
    value.outcome ? eq(crmDeals.outcome, value.outcome) : undefined,
    currencyFilter,
  );
  return {
    common,
    asOf,
    today,
    staleDays: value.staleDays,
    filters: value,
    nextActionDueDate,
    lastMeaningfulInteractionAt: sql<string | null>`${lastMeaningfulInteraction}::text`,
    cohorts: {
      open,
      overdue: and(open, sql`${nextActionDueDate} < ${today}`),
      due_today: and(open, sql`${nextActionDueDate} = ${today}`),
      no_next_action: and(open, sql`${nextActionDueDate} is null`),
      stale: and(open, sql`${freshness} < ${staleBefore}::timestamptz`),
    },
  };
}
