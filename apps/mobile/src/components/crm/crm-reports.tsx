import type { crmReportDeals } from "@substrate/contracts/crm/report-input";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

import { useState } from "react";
import { ScrollView, View } from "react-native";

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import {
  currencyOptions,
  initialReportFilters,
  reportRequest,
  staleDayBounds,
  type ReportFilters,
  type ReportFilterValue,
} from "@/features/records/crm-report-filters";
import { useRecordPeople } from "@/features/records/crm/crm-queries";
import { withValues, type FilterFieldOf } from "@/features/records/filters";
import { formatDate, formatMoney, outcomeLabels, todayDate } from "@/features/records/format";
import { recordQueries } from "@/features/records/queries";
import { recordRequests } from "@/features/records/requests";
import type { OnOpenRecord } from "@/features/records/types";
import { SelectField } from "@/features/records/ui/fields";
import { FilterBar } from "@/features/records/ui/filter-bar";
import { DetailSection, Property, Row } from "@/features/records/ui/rows";
import { SectionQuery } from "@/features/records/ui/states";
import { queryKeys, type QueryScope } from "@/queries/keys";
import { CalendarRange, CircleCheck, Clock, Coins, Layers, UserRound } from "lucide-react-native";
import type { z } from "zod";

type Cohort = z.output<typeof crmReportDeals>["cohort"];
const outcomeOptions = (["open", "won", "lost"] as const).map((value) => ({
  value,
  label: outcomeLabels[value],
}));
const cohorts: { value: Cohort; label: string }[] = [
  { value: "open", label: "Open deals" },
  { value: "closed", label: "Closed deals" },
  { value: "overdue", label: "Overdue" },
  { value: "due_today", label: "Due today" },
  { value: "no_next_action", label: "No next action" },
  { value: "stale", label: "Stale" },
];

export function CrmReports({
  scope,
  onOpenRecord,
}: {
  scope: QueryScope;
  onOpenRecord: OnOpenRecord;
}) {
  const [value, setValue] = useState<ReportFilterValue>(() => initialReportFilters(todayDate()));
  const [cohort, setCohort] = useState<Cohort>("open");
  const stages = useQuery(recordQueries.pipeline(scope));
  const people = useRecordPeople(scope);
  const settings = useQuery(recordQueries.crmSettings(scope));
  const { period, filters, valid } = reportRequest(value);
  const periodFrom = period?.from;
  const periodTo = period?.to;
  const query = useQuery({
    queryKey: queryKeys.list(scope, "crm", {
      view: "report",
      from: periodFrom,
      to: periodTo,
      ...filters,
    }),
    queryFn: ({ signal }) => {
      if (!periodFrom || !periodTo) throw new Error("Choose a valid close period.");
      return recordRequests.crmReport(
        { organizationId: scope.organizationId, from: periodFrom, to: periodTo, ...filters },
        { signal },
      );
    },
    enabled: valid,
    retry: false,
  });
  const data = valid ? query.data : undefined;
  const fields: FilterFieldOf<ReportFilterValue>[] = [
    {
      id: "close",
      kind: "date-range",
      label: "Close date",
      icon: CalendarRange,
      required: true,
      description: "Actual close dates in UTC. Both days are included.",
    },
    {
      id: "stage",
      label: "Stage",
      icon: Layers,
      loading: stages.isPending,
      options: (stages.data ?? []).map((row) => ({ value: row.id, label: row.name })),
    },
    {
      id: "owner",
      label: "Owner",
      icon: UserRound,
      loading: people.pending,
      options: people.people.map((row) => ({ value: row.id, label: row.name })),
    },
    { id: "outcome", label: "Outcome", icon: CircleCheck, options: outcomeOptions },
    {
      id: "currency",
      label: "Currency",
      icon: Coins,
      loading: settings.isPending,
      options: currencyOptions([
        settings.data?.defaultCurrency,
        ...(data?.closed ?? []).map((row) => row.currency),
        ...(data?.open ?? []).map((row) => row.currency),
        ...(value.currency ?? []),
      ]),
    },
    {
      id: "stale",
      kind: "number",
      label: "Stale after",
      icon: Clock,
      required: true,
      ...staleDayBounds,
      unit: { one: "day", other: "days" },
    },
  ];
  const set = <K extends keyof ReportFilterValue>(id: K, next: ReportFilterValue[K]) =>
    setValue((current) => withValues(current, id, next));
  return (
    <View className="flex-1">
      <FilterBar label="Report filters" fields={fields} value={value} onChange={setValue} />
      <ScrollView>
        {valid && period ? (
          <SectionQuery
            pending={query.isPending}
            error={query.error}
            noun="CRM report"
            onRetry={() => void query.refetch()}
            emptyText={null}
          >
            {data ? (
              <>
                <DetailSection title="Close results">
                  <Property label="Won" value={String(data.won)} />
                  <Property label="Lost" value={String(data.lost)} />
                  <Property
                    label="Win rate"
                    value={
                      data.winRate === null
                        ? "No closed deals"
                        : `${Math.round(data.winRate * 100)}%`
                    }
                  />
                  <Text className="px-4 py-2 text-xs text-muted-foreground">
                    Current outcomes and latest actual close. Readable, unarchived deals only.
                    Currency totals are never combined.
                  </Text>
                  {data.closed.map((row) => (
                    <Row
                      key={`${row.outcome}:${row.currency}`}
                      title={`${row.outcome} · ${row.currency ?? "Unknown currency"}`}
                      subtitle={`${row.count} deals · ${formatMoney(row.knownAmount, row.currency) || "No amount"} · ${row.missingAmountCount} missing amounts`}
                      onPress={() => {
                        setCohort("closed");
                        set("outcome", [row.outcome]);
                        set("currency", [row.currency ?? "unknown"]);
                      }}
                      chevron
                    />
                  ))}
                </DetailSection>
                <DetailSection title="Open pipeline">
                  {data.open.map((row) => (
                    <Row
                      key={`${row.stageId}:${row.ownerActorEntityId}:${row.currency}`}
                      title={`${stages.data?.find((value) => value.id === row.stageId)?.name ?? "Stage"} · ${row.currency ?? "Unknown currency"}`}
                      subtitle={`${people.people.find((person) => person.id === row.ownerActorEntityId)?.name ?? "Former member"} · ${row.count} deals · ${formatMoney(row.knownAmount, row.currency) || "No amount"} · ${row.missingAmountCount} missing amounts`}
                      onPress={() => {
                        setCohort("open");
                        set("stage", [row.stageId]);
                        set("owner", [row.ownerActorEntityId]);
                        set("currency", [row.currency ?? "unknown"]);
                      }}
                      chevron
                    />
                  ))}
                </DetailSection>
                <DetailSection title="Follow-up exceptions">
                  <Row
                    title="Overdue follow-ups"
                    subtitle={String(data.exceptions.overdue)}
                    onPress={() => setCohort("overdue")}
                    chevron
                  />
                  <Row
                    title="Due today"
                    subtitle={String(data.exceptions.dueToday)}
                    onPress={() => setCohort("due_today")}
                    chevron
                  />
                  <Row
                    title="No next action"
                    subtitle={String(data.exceptions.noNextAction)}
                    onPress={() => setCohort("no_next_action")}
                    chevron
                  />
                  <Row
                    title="Stale deals"
                    subtitle={String(data.exceptions.stale)}
                    onPress={() => setCohort("stale")}
                    chevron
                  />
                  <Text className="px-4 py-2 text-xs text-muted-foreground">
                    {data.exceptionScope}
                  </Text>
                </DetailSection>
                <View className="px-4 py-2">
                  <SelectField
                    label="Report drilldown"
                    value={cohort}
                    onChange={setCohort}
                    choices={cohorts}
                  />
                </View>
                <ReportDeals
                  scope={scope}
                  cohort={cohort}
                  period={period}
                  filters={filters}
                  asOf={data.asOf}
                  onOpenRecord={onOpenRecord}
                />
              </>
            ) : null}
          </SectionQuery>
        ) : null}
      </ScrollView>
    </View>
  );
}

function firstDeal(): string | undefined {
  return undefined;
}

function ReportDeals({
  scope,
  cohort,
  period,
  filters,
  asOf,
  onOpenRecord,
}: {
  scope: QueryScope;
  cohort: Cohort;
  period: { from: string; to: string };
  filters: ReportFilters;
  asOf: string;
  onOpenRecord: OnOpenRecord;
}) {
  const query = useInfiniteQuery({
    queryKey: queryKeys.list(scope, "crm", {
      view: "report-deals",
      cohort,
      ...period,
      ...filters,
      asOf,
    }),
    initialPageParam: firstDeal(),
    queryFn: ({ signal, pageParam }) =>
      recordRequests.crmReportDeals(
        {
          organizationId: scope.organizationId,
          cohort,
          ...period,
          ...filters,
          asOf,
          afterEntityId: pageParam,
          limit: 50,
        },
        { signal },
      ),
    getNextPageParam: (page) => page.nextAfterEntityId ?? undefined,
    retry: false,
  });
  return (
    <DetailSection title="Matching deals" count={query.data?.pages[0]?.totalCount}>
      <SectionQuery
        pending={query.isPending}
        error={query.error}
        noun="report deals"
        onRetry={() => void query.refetch()}
        emptyText={query.data?.pages[0]?.items.length ? null : "No deals in this cohort."}
      >
        {query.data?.pages
          .flatMap((page) => page.items)
          .map((row) => (
            <Row
              key={row.entityId}
              title={row.title}
              subtitle={`${formatMoney(row.amount, row.currency)} · ${row.outcome} · Next due ${formatDate(row.nextActionDueDate) || "unscheduled"}`}
              chevron
              onPress={() => onOpenRecord({ kind: "deal", id: row.entityId })}
            />
          ))}
        {query.hasNextPage ? (
          <Button
            variant="ghost"
            disabled={query.isFetchingNextPage}
            onPress={() => void query.fetchNextPage()}
          >
            <Text>Show more deals</Text>
          </Button>
        ) : null}
      </SectionQuery>
    </DetailSection>
  );
}
