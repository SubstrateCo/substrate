import {
  listInput,
  pageSize,
  providerNames,
  type MeetingListInput,
  type MeetingRow,
} from "@substrate/contracts/meetings";

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { useMemo, type ReactNode } from "react";

import { isAccessFailure } from "@/api/access-failure";
import { ContentNotice } from "@/components/feedback/content-notice";
import { PageHeader } from "@/components/layout/page-header";
import { ProviderMark } from "@/components/meetings/sources/meeting-provider";
import { AppTable, createAppColumnHelper, tableLink } from "@/components/table";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  formatMeetingDuration,
  formatArchiveDate,
  formatWallTime,
  parseDateOnly,
} from "@/lib/format/date";
import { peopleLabels } from "@/lib/meetings/display";
import {
  closedReader,
  type ChangeMeetingView,
  type MeetingSearch,
} from "@/lib/meetings/navigation";
import { meetingLink } from "@/lib/navigation/record-links";
import type { MeetingQueries } from "@/queries/meetings/options";
import { cn } from "cn";
import { AudioLines, CalendarDays, NotebookPen, Plus } from "lucide-react";

const column = createAppColumnHelper<MeetingRow>();
function contents(m: MeetingRow) {
  if (m.notes) return { label: m.transcript ? "Notes + transcript" : "Notes", icon: NotebookPen };
  if (m.transcript) return { label: "Transcript", icon: AudioLines };
  return {
    label: m.people.some((p) => p.evidence === "attendance") ? "Attendance" : "Meeting details",
    icon: CalendarDays,
  };
}

const meetingColumns = (organizationId: string, view: MeetingSearch) =>
  column.columns([
    column.accessor("title", {
      header: "Meeting",
      sortDescFirst: false,
      meta: { controls: true },
      cell: ({ row }) => (
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              {...meetingLink(organizationId, row.id, view)}
              className={tableLink}
              id={`meeting-${row.id}`}
              title={row.original.title}
              onClick={(event) => event.stopPropagation()}
            >
              {row.original.title}
            </Link>
          </TooltipTrigger>
          <TooltipContent>{row.original.title}</TooltipContent>
        </Tooltip>
      ),
    }),
    column.accessor((row) => row.localStart.slice(0, 10), {
      id: "date",
      header: "Date",
      sortDescFirst: true,
      meta: { width: "w-25" },
      cell: ({ getValue }) => (
        <time dateTime={getValue()}>{formatArchiveDate(parseDateOnly(getValue())!)}</time>
      ),
    }),
    column.accessor("localStart", {
      id: "time",
      header: "Time",
      sortDescFirst: false,
      meta: { width: "w-20" },
      cell: ({ getValue }) => formatWallTime(getValue()),
    }),
    column.accessor("durationMs", {
      id: "duration",
      header: "Duration",
      sortDescFirst: true,
      meta: { width: "w-28", align: "end" },
      cell: ({ getValue }) => formatMeetingDuration(getValue()),
    }),
    column.display({
      id: "people",
      header: "People",
      meta: { width: "w-[15%]" },
      cell: ({ row }) => {
        const people = peopleLabels(row.original.people.filter((p) => p.evidence !== "self")).join(
          ", ",
        );
        return (
          <span className="block truncate text-muted-foreground" title={people}>
            {people || "—"}
          </span>
        );
      },
    }),
    column.display({
      id: "content",
      header: "Content",
      meta: { width: "w-36" },
      cell: ({ row: { original: m } }) => {
        const { label, icon: Icon } = contents(m);
        return (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Icon aria-hidden="true" className="size-3.5" />
            {label}
          </span>
        );
      },
    }),
    column.display({
      id: "sources",
      header: "Sources",
      meta: { width: "w-32 @min-[1081px]:w-64" },
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5">
          {row.original.providers.map((p) => (
            <Tooltip key={p}>
              <TooltipTrigger asChild>
                <span className="flex min-w-0 items-center gap-1 text-micro text-muted-foreground">
                  <ProviderMark provider={p} size="row" />
                  <span
                    className={cn(
                      "truncate",
                      row.original.providers.length > 1 && "@max-[1080px]:sr-only",
                      row.original.providers.length > 3 && "sr-only",
                    )}
                  >
                    {providerNames[p]}
                  </span>
                </span>
              </TooltipTrigger>
              <TooltipContent>{providerNames[p]}</TooltipContent>
            </Tooltip>
          ))}
        </div>
      ),
    }),
  ]);

export function AllMeetings({
  queries,
  input,
  view,
  searchPending,
  change,
  open,
  originals,
  filters,
  clearFilters,
  addMeeting,
}: {
  queries: MeetingQueries;
  input: MeetingListInput;
  view: MeetingSearch;
  searchPending: boolean;
  change: ChangeMeetingView;
  open: (id: string) => void;
  originals?: number;
  filters: ReactNode;
  clearFilters: () => void;
  addMeeting: () => void;
}) {
  const columns = useMemo(
    () => meetingColumns(queries.organizationId, view),
    [queries.organizationId, view],
  );
  const query = useQuery({ ...queries.list(input), enabled: !searchPending });
  if (isAccessFailure(query.error)) return <ContentNotice title="Meeting archive unavailable" />;
  // Do not show cached private records after an access failure.
  const page = query.isSuccess ? query.data : undefined;
  const { rows, total } = page ?? { rows: [], total: 0 };
  let title = "All meetings";
  if (input.source) title = `${providerNames[input.source]} meetings`;
  if (input.q) title = "Search results";
  let description = `${total} ${total === 1 ? "meeting" : "meetings"}`;
  if (filters) description += " in this view";
  else if (originals !== undefined)
    description += ` · ${originals} linked source ${originals === 1 ? "record" : "records"}`;
  return (
    <div className="mx-auto flex min-h-0 w-full max-w-400 flex-col">
      <PageHeader
        className="mb-4 md:mb-5"
        title={title}
        description={page ? description : undefined}
        actions={
          <>
            <Button onClick={addMeeting}>
              <Plus />
              Add meeting
            </Button>
            <Button
              variant="outline"
              onClick={() => change({ ...closedReader, section: "calendar", day: undefined })}
            >
              <CalendarDays />
              {input.day ? "Back to calendar" : "View calendar"}
            </Button>
          </>
        }
      />
      {filters && <div className="mb-3">{filters}</div>}
      <AppTable
        name="All meetings"
        layout="ledger"
        pageSummary={
          rows.length
            ? `${input.offset + 1}–${input.offset + rows.length} of ${total} meetings`
            : undefined
        }
        columns={columns}
        data={rows}
        getRowId={(row) => row.id}
        selectedRowId={view.meetingId}
        onRowClick={(row) => open(row.id)}
        loading={query.isPending}
        loadingMessage="Loading meetings"
        fetching={query.isFetching}
        error={query.error}
        errorTitle="Couldn’t load meetings"
        onRetry={() => void query.refetch()}
        empty={{
          icon: CalendarDays,
          title: "No meetings found",
          description:
            input.source || input.q || input.day
              ? "Try a different date, source, or search."
              : "Add a meeting or import a Hex Markdown file to start your archive.",
          action: (
            <Button size="sm" variant="outline" onClick={filters ? clearFilters : addMeeting}>
              {filters ? "Clear filters" : "Add your first meeting"}
            </Button>
          ),
        }}
        pagination={{
          mode: "server",
          pageSize,
          pageIndex: Math.floor(input.offset / pageSize),
          rowCount: total,
          hasNextPage: input.offset + pageSize < total,
          onPageChange: (page) => change({ offset: page * pageSize }),
          sorting: {
            value: [{ id: input.sort, desc: input.dir === "desc" }],
            onChange: ([{ id, desc }]) =>
              change({
                sort: listInput.shape.sort.parse(id),
                dir: desc ? "desc" : "asc",
                offset: 0,
              }),
          },
        }}
      />
    </div>
  );
}
