import type {
  InteractionDirectory as DirectoryInput,
  InteractionTimeline,
} from "@substrate/contracts/context/interactions";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { useMemo, useState } from "react";

import { frequencyField, periodField } from "./interaction-filter-fields";
import {
  interactionFiltersFrom,
  interactionFilterValue,
  type InteractionDays,
  type InteractionFilters,
} from "./interaction-filters";
import { useSourceCalendarField } from "./use-source-calendar-field";
import type { getInteractionDirectory } from "@/api/context/interactions";
import { FilterBar, SortControl, type FilterField, type SortOption } from "@/components/filters";
import { AppTable, createAppColumnHelper, dateTimeColumn, tableLink } from "@/components/table";
import { Input } from "@/components/ui/input";
import { useSearchDebounce } from "@/hooks/use-search-debounce";
import { interactionDirectoryOptions } from "@/queries/context/interactions";
import { Building2, Users, Hash } from "lucide-react";

type DirectoryRow = Awaited<ReturnType<typeof getInteractionDirectory>>["items"][number];
type DirectorySort = NonNullable<DirectoryInput["sort"]>;

const sortOptions: SortOption<DirectorySort>[] = [
  { value: "latest", label: "Latest activity" },
  { value: "name", label: "Name" },
  { value: "count", label: "Most interactions" },
];

const column = createAppColumnHelper<DirectoryRow>();
const maxPageSize = 100;

function directoryColumns(type: DirectoryInput["type"]) {
  return column.columns([
    column.accessor("name", {
      header: "Name",
      cell: ({ row }) => (
        <Link
          to="/interactions"
          search={(previous) => ({
            ...previous,
            section: type === "people" ? "person" : "account",
            profileId: row.original.entityId,
            tab: undefined,
          })}
          className={tableLink}
          title={row.original.name}
        >
          {row.original.name}
        </Link>
      ),
    }),
    column.accessor("count", {
      header: "Interactions",
      meta: { align: "end", width: "w-36" },
      cell: ({ cell }) => <cell.NumberCell />,
    }),
    ...(type === "accounts"
      ? [
          column.accessor("contacts", {
            header: "Active contacts",
            meta: { align: "end", width: "w-36" },
            cell: ({ cell }) => <cell.NumberCell />,
          }),
        ]
      : []),
    dateTimeColumn<DirectoryRow>((row) => row.last, { id: "last", header: "Last interaction" }),
  ]);
}

export function InteractionDirectory({
  period,
  days,
  onDaysChange,
  type,
  onSourceCalendarChange,
}: {
  period: InteractionTimeline;
  days: InteractionDays;
  onDaysChange: (days: InteractionDays) => void;
  type: "people" | "accounts";
  onSourceCalendarChange: (value?: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [repeat, setRepeat] = useState(false);
  const [countFilter, setCountFilter] = useState<
    Pick<InteractionFilters, "countOperator" | "count" | "countUntil">
  >({});
  const calendarFields = useSourceCalendarField();
  const [sort, setSort] = useState<DirectorySort>("latest");
  const [pageSize, setPageSize] = useState<number>();
  const debounced = useSearchDebounce(search, `${repeat}:${sort}`);
  const filters: InteractionFilters = {
    days,
    repeat,
    ...countFilter,
    sourceCalendarEntityId: period.sourceCalendarEntityId,
  };
  const countField: FilterField<"count"> = {
    id: "count",
    label: "Interaction count",
    icon: Hash,
    kind: "number",
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Input
          type="search"
          aria-label={type === "people" ? "Search people" : "Search organizations"}
          placeholder={type === "people" ? "Search people" : "Search organizations"}
          className="w-72 max-w-full"
          value={search}
          maxLength={200}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="ml-auto">
          <SortControl options={sortOptions} value={sort} onValueChange={setSort} />
        </div>
      </div>
      <div className="min-w-0">
        <FilterBar
          aria-label="Directory filters"
          fields={[
            periodField({ allTime: true }),
            ...(type === "people" ? [countField] : [frequencyField]),
            ...calendarFields,
          ]}
          value={interactionFilterValue(filters)}
          onValueChange={(value) => {
            const next = interactionFiltersFrom(value, filters);
            setRepeat(!!next.repeat);
            setCountFilter({
              countOperator: next.countOperator,
              count: next.count,
              countUntil: next.countUntil,
            });
            if (next.sourceCalendarEntityId !== period.sourceCalendarEntityId)
              onSourceCalendarChange(next.sourceCalendarEntityId);
            if (next.days !== days) onDaysChange(next.days);
          }}
        />
      </div>
      <DirectoryPage
        key={JSON.stringify([period, debounced.query, repeat, sort, countFilter])}
        input={{
          ...period,
          type,
          pageSize,
          search: debounced.query,
          repeat: repeat ? "true" : undefined,
          sort,
          ...countFilter,
        }}
        pending={debounced.pending || pageSize === undefined}
        onFitPageSize={(rows) => setPageSize(Math.min(rows, maxPageSize))}
      />
    </div>
  );
}

function DirectoryPage({
  input,
  pending,
  onFitPageSize,
}: {
  input: DirectoryInput;
  pending: boolean;
  onFitPageSize: (rows: number) => void;
}) {
  const [offset, setOffset] = useState(0);
  const query = useQuery({
    ...interactionDirectoryOptions({ ...input, offset }),
    enabled: !pending,
    placeholderData: keepPreviousData,
  });
  const pageSize = input.pageSize ?? 1;
  const columns = useMemo(() => directoryColumns(input.type), [input.type]);
  return (
    <AppTable
      name={input.type === "people" ? "People directory" : "Organization directory"}
      columns={columns}
      data={query.data?.items ?? []}
      getRowId={(row) => row.entityId}
      loading={!query.data && !query.error}
      loadingMessage="Loading interaction directory"
      fetching={query.isPlaceholderData}
      error={query.error}
      errorTitle="Couldn’t load the directory"
      onRetry={() => void query.refetch()}
      empty={{
        title: input.type === "people" ? "No matching people" : "No matching organizations",
        description:
          "Try another search or period. Only records with readable logged interactions appear here.",
        icon: input.type === "people" ? Users : Building2,
      }}
      pagination={{
        mode: "server",
        pageIndex: Math.floor(offset / pageSize),
        pageSize,
        hasNextPage: Boolean(query.data?.more),
        onPageChange: (pageIndex) => setOffset(pageIndex * pageSize),
        onFitPageSize,
      }}
    />
  );
}
