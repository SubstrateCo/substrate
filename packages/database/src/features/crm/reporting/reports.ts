import { crmReportDeals } from "@substrate/contracts/crm/report-input";

import { requireAppEnabled, requireAppEnabledForActiveActor } from "../../../core/apps/access";
import { parseInput } from "../../../core/contacts/inputs";
import { RepositoryContext } from "../../../core/repository-context";
import { ValidationError } from "../../../errors";
import { reportQuery, type ReportFilters } from "./report-queries";
import { crmDeals } from "../schema";
import { and, asc, eq, gt, gte, lt, sql } from "drizzle-orm";
import type { z } from "zod";

export async function report(
  context: RepositoryContext,
  from: Date,
  to: Date,
  options: ReportFilters = {},
) {
  return context.db.transaction(
    (tx) => reportRows(new RepositoryContext(tx, context.scope), from, to, options),
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}

async function reportRows(
  context: RepositoryContext,
  from: Date,
  to: Date,
  options: ReportFilters,
) {
  await requireAppEnabledForActiveActor(context, "crm");
  if (!Number.isFinite(+from) || !Number.isFinite(+to) || from >= to)
    throw new ValidationError("Choose a valid half-open close period.");
  const { db } = context;
  const query = reportQuery(context, options);
  const { common } = query;
  const totals = {
    count: sql<number>`count(*)::int`,
    knownAmount: sql<string | null>`sum(${crmDeals.amount})::text`,
    missingAmountCount: sql<number>`count(*) filter (where ${crmDeals.amount} is null)::int`,
  };
  const open = await db
    .select({
      stageId: crmDeals.stageId,
      ownerActorEntityId: crmDeals.ownerActorEntityId,
      currency: crmDeals.currency,
      ...totals,
    })
    .from(crmDeals)
    .where(and(common, eq(crmDeals.outcome, "open")))
    .groupBy(crmDeals.stageId, crmDeals.ownerActorEntityId, crmDeals.currency);
  const closed = await db
    .select({ outcome: crmDeals.outcome, currency: crmDeals.currency, ...totals })
    .from(crmDeals)
    .where(and(common, gte(crmDeals.closedAt, from), lt(crmDeals.closedAt, to)))
    .groupBy(crmDeals.outcome, crmDeals.currency);
  const won = closed
    .filter((row) => row.outcome === "won")
    .reduce((sum, row) => sum + row.count, 0);
  const lost = closed
    .filter((row) => row.outcome === "lost")
    .reduce((sum, row) => sum + row.count, 0);
  const deals = await db
    .select({
      entityId: crmDeals.entityId,
      title: crmDeals.title,
      stageId: crmDeals.stageId,
      outcome: crmDeals.outcome,
      amount: crmDeals.amount,
      currency: crmDeals.currency,
      closedAt: crmDeals.closedAt,
    })
    .from(crmDeals)
    .where(and(common, gte(crmDeals.closedAt, from), lt(crmDeals.closedAt, to)))
    .orderBy(asc(crmDeals.entityId))
    .limit(100);
  const [exceptions] = await db
    .select({
      overdue: sql<number>`count(*) filter (where ${query.cohorts.overdue})::int`,
      dueToday: sql<number>`count(*) filter (where ${query.cohorts.due_today})::int`,
      noNextAction: sql<number>`count(*) filter (where ${query.cohorts.no_next_action})::int`,
      stale: sql<number>`count(*) filter (where ${query.cohorts.stale})::int`,
    })
    .from(crmDeals)
    .where(common);
  return {
    open,
    closed,
    won,
    lost,
    winRate: won + lost ? won / (won + lost) : null,
    from: from.toISOString(),
    to: to.toISOString(),
    dateBasis: "current outcome and latest actual close; [from,to)" as const,
    scope: "readable unarchived deals" as const,
    generatedAt: new Date().toISOString(),
    closedDeals: deals,
    closedDealsTruncated: won + lost > deals.length,
    exceptions: exceptions!,
    asOf: query.asOf,
    timezone: "UTC" as const,
    staleDays: query.staleDays,
    filters: query.filters,
    exceptionScope:
      "readable linked open tasks and readable meaningful interactions explicitly linked to the deal; unscheduled tasks do not count as a scheduled next action; stale falls back to deal creation when no readable explicitly linked touch exists" as const,
  };
}

type DrilldownInput = Omit<z.input<typeof crmReportDeals>, "organizationId">;
export async function reportDeals(context: RepositoryContext, input: DrilldownInput) {
  await requireAppEnabled(context, "crm");
  const value = parseInput(crmReportDeals, {
    ...input,
    organizationId: context.scope.organizationId,
  });
  if (
    value.cohort === "closed" &&
    (!value.from || !value.to || new Date(value.from) >= new Date(value.to))
  )
    throw new ValidationError("Choose a valid close period.");
  return context.db.transaction(
    async (tx) => {
      const ctx = new RepositoryContext(tx, context.scope);
      await ctx.requireActiveActor();
      const query = reportQuery(ctx, value);
      const cohort =
        value.cohort === "closed"
          ? and(
              gte(crmDeals.closedAt, new Date(value.from!)),
              lt(crmDeals.closedAt, new Date(value.to!)),
            )
          : query.cohorts[value.cohort];
      const where = and(query.common, cohort);
      const [total] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(crmDeals)
        .where(where);
      const rows = await tx
        .select({
          entityId: crmDeals.entityId,
          title: crmDeals.title,
          stageId: crmDeals.stageId,
          ownerActorEntityId: crmDeals.ownerActorEntityId,
          outcome: crmDeals.outcome,
          amount: crmDeals.amount,
          currency: crmDeals.currency,
          closedAt: crmDeals.closedAt,
          nextActionDueDate: query.nextActionDueDate,
          lastMeaningfulInteractionAt: query.lastMeaningfulInteractionAt,
        })
        .from(crmDeals)
        .where(
          and(where, value.afterEntityId ? gt(crmDeals.entityId, value.afterEntityId) : undefined),
        )
        .orderBy(asc(crmDeals.entityId))
        .limit(value.limit + 1);
      const items = rows.slice(0, value.limit).map((row) => ({
        ...row,
        lastMeaningfulInteractionAt: row.lastMeaningfulInteractionAt
          ? new Date(row.lastMeaningfulInteractionAt).toISOString()
          : null,
      }));
      return {
        items,
        totalCount: total!.count,
        nextAfterEntityId: rows.length > value.limit ? items.at(-1)!.entityId : null,
        cohort: value.cohort,
        asOf: query.asOf,
        timezone: "UTC" as const,
        staleDays: query.staleDays,
        filters: query.filters,
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
