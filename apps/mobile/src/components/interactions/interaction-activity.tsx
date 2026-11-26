import { useQuery, useInfiniteQuery } from "@tanstack/react-query";

import { useState } from "react";
import { ScrollView, View } from "react-native";

import { InteractionRow } from "./interaction-row";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { interactionKindLabels } from "@/features/records/format";
import { interactionPeriod } from "@/features/records/interaction-filters";
import { recordRequests } from "@/features/records/requests";
import type { OnOpenRecord } from "@/features/records/types";
import { DetailSection, Property, Row, Segments } from "@/features/records/ui/rows";
import { SectionQuery } from "@/features/records/ui/states";
import { queryKeys, type QueryScope } from "@/queries/keys";

export function InteractionActivity({
  scope,
  onOpenRecord,
}: {
  scope: QueryScope;
  onOpenRecord: OnOpenRecord;
}) {
  const [days, setDays] = useState<"7" | "30">("7");
  const [day, setDay] = useState<string | null>(null);
  const query = useQuery({
    queryKey: queryKeys.list(scope, "interactions", { view: "activity", days }),
    queryFn: ({ signal }) =>
      recordRequests.interactionActivity(
        {
          organizationId: scope.organizationId,
          ...interactionPeriod(days),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
        { signal },
      ),
    retry: false,
  });
  const summary = query.data?.summary;
  return (
    <View className="flex-1">
      <Segments
        label="Activity period"
        value={days}
        onChange={(value) => {
          setDays(value);
          setDay(null);
        }}
        options={[
          { value: "7", label: "Last 7 days" },
          { value: "30", label: "Last 30 days" },
        ]}
      />
      <ScrollView>
        <SectionQuery
          pending={query.isPending}
          error={query.error}
          noun="interaction activity"
          onRetry={() => void query.refetch()}
          emptyText={null}
        >
          {summary ? (
            <DetailSection title="Interaction summary">
              <Property label="Logged interactions" value={String(summary.total)} />
              <Property label="Contacts reached" value={String(summary.contacts)} />
              <Property label="Meetings & calls" value={String(summary.meetingsAndCalls)} />
              <Property
                label="Recorded minutes"
                value={String(Math.round(summary.recordedMinutes))}
              />
              <Property label="Published from messages" value={String(summary.published)} />
            </DetailSection>
          ) : null}
          <DetailSection title="Daily activity">
            {query.data?.activity.map((row) => (
              <Row
                key={`${row.day}:${row.kind}`}
                title={row.day}
                subtitle={`${interactionKindLabels[row.kind]} · ${row.count}`}
                onPress={() => setDay(row.day)}
                chevron
              />
            ))}
            {summary?.total === 0 ? (
              <Text className="px-4 py-3 text-sm text-muted-foreground">
                No interactions in this period.
              </Text>
            ) : null}
          </DetailSection>
        </SectionQuery>
        {day ? (
          <DayInteractions key={day} scope={scope} day={day} onOpenRecord={onOpenRecord} />
        ) : null}
      </ScrollView>
    </View>
  );
}

function firstCursor(): { beforeOccurredAt: string; beforeEntityId: string } | undefined {
  return undefined;
}

function DayInteractions({
  scope,
  day,
  onOpenRecord,
}: {
  scope: QueryScope;
  day: string;
  onOpenRecord: OnOpenRecord;
}) {
  const from = new Date(`${day}T00:00:00`);
  const until = new Date(from);
  until.setDate(until.getDate() + 1);
  const query = useInfiniteQuery({
    queryKey: queryKeys.list(scope, "interactions", { view: "day", day }),
    initialPageParam: firstCursor(),
    queryFn: ({ signal, pageParam }) =>
      recordRequests.interactionTimeline(
        {
          organizationId: scope.organizationId,
          from: from.toISOString(),
          until: until.toISOString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          ...pageParam,
        },
        { signal },
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    retry: false,
  });
  return (
    <DetailSection title={`Interactions on ${day}`}>
      <SectionQuery
        pending={query.isPending}
        error={query.error}
        noun="day's interactions"
        onRetry={() => void query.refetch()}
        emptyText={query.data?.pages[0]?.items.length ? null : "No interactions on this day."}
      >
        {query.data?.pages
          .flatMap((page) => page.items)
          .map((row) => (
            <InteractionRow
              key={row.entityId}
              interaction={row}
              showContact
              onPress={() => onOpenRecord({ kind: "interaction", id: row.entityId })}
            />
          ))}
        {query.hasNextPage ? (
          <Button
            variant="ghost"
            disabled={query.isFetchingNextPage}
            onPress={() => void query.fetchNextPage()}
          >
            <Text>Show more</Text>
          </Button>
        ) : null}
      </SectionQuery>
    </DetailSection>
  );
}
