import type {
  InteractionDirectory as DirectoryInput,
  InteractionTimeline,
} from "@substrate/contracts/context/interactions";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { useState, type ReactNode } from "react";

import type { getInteractionDirectory } from "@/api/context/interactions";
import { SegmentedControl } from "@/components/forms/segmented-control";
import { AppTable, createAppColumnHelper, dateTimeColumn, tableLink } from "@/components/table";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSearchDebounce } from "@/hooks/use-search-debounce";
import { interactionDirectoryOptions } from "@/queries/context/interactions";
import { Building2, Users } from "lucide-react";

type DirectoryRow = Awaited<ReturnType<typeof getInteractionDirectory>>["items"][number];

const column = createAppColumnHelper<DirectoryRow>();
const pageSizeOptions = [25, 50, 100];

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
      meta: { align: "end" },
      cell: ({ cell }) => <cell.NumberCell />,
    }),
    ...(type === "accounts"
      ? [
          column.accessor("contacts", {
            header: "Active contacts",
            meta: { align: "end" },
            cell: ({ cell }) => <cell.NumberCell />,
          }),
        ]
      : []),
    dateTimeColumn<DirectoryRow>((row) => row.last, { id: "last", header: "Last interaction" }),
  ]);
}

export function InteractionDirectory({
  period,
  type,
  filters,
}: {
  period: InteractionTimeline;
  type: "people" | "accounts";
  /** Filters right after the search, such as the activity period. */
  filters?: ReactNode;
}) {
  const [search, setSearch] = useState("");
  const [frequency, setFrequency] = useState("all");
  const [sort, setSort] = useState("latest");
  const [pageSize, setPageSize] = useState("25");
  const debounced = useSearchDebounce(search, `${frequency}:${sort}`);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Input
          type="search"
          aria-label={type === "people" ? "Search people" : "Search organizations"}
          placeholder={type === "people" ? "Search people…" : "Search organizations…"}
          className="w-72 max-w-full"
          value={search}
          maxLength={200}
          onChange={(e) => setSearch(e.target.value)}
        />
        {filters}
        <SegmentedControl
          aria-label="Interaction frequency"
          value={frequency}
          onValueChange={setFrequency}
          options={[
            { value: "all", label: "All" },
            { value: "repeat", label: "2+ interactions" },
          ]}
        />
        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger aria-label="Sort by">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="latest">Latest activity</SelectItem>
            <SelectItem value="name">Name</SelectItem>
            <SelectItem value="count">Most interactions</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <DirectoryPage
        key={`${debounced.query}:${frequency}:${sort}:${pageSize}`}
        input={{
          ...period,
          type,
          pageSize: Number(pageSize),
          search: debounced.query,
          repeat: frequency === "repeat" ? "true" : undefined,
          sort: (["latest", "name", "count"] as const).find((value) => value === sort),
        }}
        pending={debounced.pending}
        onPageSizeChange={setPageSize}
      />
    </div>
  );
}

function DirectoryPage({
  input,
  pending,
  onPageSizeChange,
}: {
  input: DirectoryInput;
  pending: boolean;
  onPageSizeChange: (value: string) => void;
}) {
  const [offset, setOffset] = useState(0);
  const query = useQuery({
    ...interactionDirectoryOptions({ ...input, offset }),
    enabled: !pending,
    placeholderData: keepPreviousData,
  });
  const pageSize = input.pageSize ?? 25;
  const [columns] = useState(() => directoryColumns(input.type));
  return (
    <AppTable
      name={input.type === "people" ? "People directory" : "Organization directory"}
      columns={columns}
      data={query.data?.items ?? []}
      getRowId={(row) => row.entityId}
      loading={!query.data && !query.error}
      loadingMessage="Loading interaction directory…"
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
        pageSizeOptions,
        onPageSizeChange: (size) => onPageSizeChange(String(size)),
      }}
    />
  );
}
