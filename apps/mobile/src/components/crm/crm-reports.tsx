import type { crmReportDeals } from "@substrate/contracts/crm/report-input";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

import { useState } from "react";
import { ScrollView, View } from "react-native";

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { useRecordPeople } from "@/features/records/crm-queries";
import { formatDate, formatMoney, todayDate } from "@/features/records/format";
import { recordQueries } from "@/features/records/queries";
import { reportPeriod } from "@/features/records/report-period";
import { recordRequests } from "@/features/records/requests";
import type { OnOpenRecord } from "@/features/records/types";
import { DateField, SelectField, TextField } from "@/features/records/ui/fields";
import { DetailSection, Property, Row } from "@/features/records/ui/rows";
import { SectionQuery } from "@/features/records/ui/states";
import { queryKeys, type QueryScope } from "@/queries/keys";
import type { z } from "zod";

type Cohort = z.output<typeof crmReportDeals>["cohort"];
type ReportFilters = {
  stageId?: string;
  ownerActorEntityId?: string;
  currency?: string;
  outcome?: "open" | "won" | "lost";
  staleDays: number;
};
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
  const [through, setThrough] = useState(todayDate);
  const [from, setFrom] = useState(() => `${todayDate().slice(0, 7)}-01`);
  const [stage, setStage] = useState("all");
  const [owner, setOwner] = useState("all");
  const [currency, setCurrency] = useState("");
  const [outcome, setOutcome] = useState("all");
  const [staleDays, setStaleDays] = useState("30");
  const [cohort, setCohort] = useState<Cohort>("open");
  const stages = useQuery(recordQueries.pipeline(scope));
  const people = useRecordPeople(scope);
  const period = reportPeriod(from, through);
  const periodFrom = period?.from;
  const periodTo = period?.to;
  const valid =
    !!period &&
    /^(unknown|[A-Z]{3})?$/.test(currency) &&
    /^\d{1,4}$/.test(staleDays) &&
    Number(staleDays) >= 1 &&
    Number(staleDays) <= 3650;
  const filters: ReportFilters = { staleDays: Number(staleDays) };
  if (stage !== "all") filters.stageId = stage;
  if (owner !== "all") filters.ownerActorEntityId = owner;
  if (currency) filters.currency = currency;
  if (outcome === "open" || outcome === "won" || outcome === "lost") filters.outcome = outcome;
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
  return (
    <ScrollView>
      <View className="gap-3 px-4 py-3">
        <DateField label="Actual close from (UTC)" value={from} onChange={setFrom} />
        <DateField label="Actual close through (UTC)" value={through} onChange={setThrough} />
        <SelectField
          label="Stage filter"
          value={stage}
          onChange={setStage}
          loading={stages.isPending}
          choices={[
            { value: "all", label: "All stages" },
            ...(stages.data ?? []).map((row) => ({ value: row.id, label: row.name })),
          ]}
        />
        <SelectField
          label="Responsible owner filter"
          value={owner}
          onChange={setOwner}
          loading={people.pending}
          choices={[
            { value: "all", label: "All owners" },
            ...people.people.map((row) => ({ value: row.id, label: row.name })),
          ]}
        />
        <SelectField
          label="Outcome filter"
          value={outcome}
          onChange={setOutcome}
          choices={[
            { value: "all", label: "All outcomes" },
            { value: "open", label: "Open" },
            { value: "won", label: "Won" },
            { value: "lost", label: "Lost" },
          ]}
        />
        <TextField
          label="Currency filter"
          value={currency}
          onChange={setCurrency}
          placeholder="USD, unknown, or empty for all"
          maxLength={7}
        />
        <TextField
          label="Stale after days"
          value={staleDays}
          onChange={setStaleDays}
          keyboardType="number-pad"
          maxLength={4}
        />
        {!valid ? (
          <Text className="text-sm text-destructive">
            Choose ordered dates, a currency code or “unknown”, and 1–3650 stale days.
          </Text>
        ) : null}
      </View>
      {valid ? (
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
                    data.winRate === null ? "No closed deals" : `${Math.round(data.winRate * 100)}%`
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
                      setOutcome(row.outcome);
                      setCurrency(row.currency ?? "unknown");
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
                      setStage(row.stageId);
                      setOwner(row.ownerActorEntityId);
                      setCurrency(row.currency ?? "unknown");
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
