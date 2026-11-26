import type { InteractionDirectory as DirectoryInput } from "@substrate/contracts/context/interactions";

import { useInfiniteQuery } from "@tanstack/react-query";

import { useState } from "react";
import { View } from "react-native";

import { formatDateTime } from "@/features/records/format";
import { interactionPeriod, type InteractionDays } from "@/features/records/interaction-filters";
import { recordRequests } from "@/features/records/requests";
import type { OnOpenRecord } from "@/features/records/types";
import { SelectField } from "@/features/records/ui/fields";
import { SearchBar, useDebounced } from "@/features/records/ui/layout";
import { PagedList } from "@/features/records/ui/record-list";
import { Row, Segments } from "@/features/records/ui/rows";
import { queryKeys, type QueryScope } from "@/queries/keys";

export function InteractionDirectory({
  scope,
  type,
  onOpenRecord,
}: {
  scope: QueryScope;
  type: "people" | "accounts";
  onOpenRecord: OnOpenRecord;
}) {
  const [search, setSearch] = useState("");
  const [days, setDays] = useState<InteractionDays>("all");
  const [frequency, setFrequency] = useState("all");
  const [sort, setSort] = useState<NonNullable<DirectoryInput["sort"]>>("latest");
  const [pageSize, setPageSize] = useState("25");
  const term = useDebounced(search.trim());
  const size = Number(pageSize);
  const query = useInfiniteQuery({
    queryKey: queryKeys.list(scope, "interactions", {
      view: "directory",
      type,
      term,
      days,
      frequency,
      sort,
      size,
    }),
    initialPageParam: 0,
    queryFn: ({ signal, pageParam }) =>
      recordRequests.interactionDirectory(
        {
          organizationId: scope.organizationId,
          ...interactionPeriod(days),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          type,
          search: term,
          repeat: frequency === "repeat" ? "true" : undefined,
          sort,
          offset: pageParam,
          pageSize: size,
        },
        { signal },
      ),
    getNextPageParam: (page, pages) => (page.more ? pages.length * size : undefined),
    retry: false,
  });
  return (
    <View className="flex-1">
      <SearchBar
        value={search}
        onChange={setSearch}
        placeholder={type === "people" ? "Search people" : "Search organizations"}
      />
      <Segments
        label="Directory period"
        value={days}
        onChange={setDays}
        options={[
          { value: "all", label: "All time" },
          { value: "7", label: "Last 7 days" },
          { value: "30", label: "Last 30 days" },
        ]}
      />
      <Segments
        label="Interaction frequency"
        value={frequency}
        onChange={setFrequency}
        options={[
          { value: "all", label: "All" },
          { value: "repeat", label: "2+ interactions" },
        ]}
      />
      <View className="gap-2 px-4 py-2">
        <SelectField
          label="Sort by"
          value={sort}
          onChange={setSort}
          choices={[
            { value: "latest", label: "Latest activity" },
            { value: "name", label: "Name" },
            { value: "count", label: "Most interactions" },
          ]}
        />
        <SelectField
          label="Page size"
          value={pageSize}
          onChange={setPageSize}
          choices={["25", "50", "100"].map((value) => ({ value, label: value }))}
        />
      </View>
      <PagedList
        query={query}
        noun="interaction directory"
        items={(pages) => pages.flatMap((page) => page.items)}
        keyOf={(row) => row.entityId}
        empty={{
          title: "No matching records",
          description: "Only records with readable logged interactions appear here.",
        }}
        renderItem={(row) => (
          <Row
            title={row.name}
            subtitle={`${row.count} interactions · ${row.contacts} contacts · ${formatDateTime(row.last)}`}
            chevron
            onPress={() =>
              onOpenRecord({ kind: type === "people" ? "contact" : "account", id: row.entityId })
            }
          />
        )}
      />
    </View>
  );
}
