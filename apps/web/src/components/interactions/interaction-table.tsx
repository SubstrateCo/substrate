import { useMemo } from "react";

import { ContactProfileLink, InteractionRecordLink } from "./interaction-link";
import {
  emptySources,
  interactionOrigins,
  interactionTypes,
  type InteractionRow,
  type InteractionSources,
} from "./interaction-types";
import { MeetingSourceLink } from "@/components/calendar/meeting-source-link";
import {
  AppTable,
  createAppColumnHelper,
  tableLink,
  type AppTablePagination,
} from "@/components/table";
import { Timestamp } from "@/components/time/timestamp";
import { Activity } from "lucide-react";

const column = createAppColumnHelper<InteractionRow>();

function interactionColumns(sources: InteractionSources) {
  return column.columns([
    column.accessor("occurredAt", {
      header: "Time",
      meta: { width: "w-24" },
      cell: ({ row }) => (
        <span className="block truncate text-muted-foreground">
          <Timestamp value={row.original.occurredAt} format="time" />
        </span>
      ),
    }),
    column.accessor("contactName", {
      header: "Contact",
      meta: { width: "w-36" },
      cell: ({ row }) => (
        <ContactProfileLink
          contactEntityId={row.original.contactEntityId}
          className="block truncate text-muted-foreground underline-offset-4 hover:underline"
          title={row.original.contactName}
        >
          {row.original.contactName}
        </ContactProfileLink>
      ),
    }),
    column.accessor("summary", {
      header: "Summary",
      cell: ({ row }) => (
        <>
          <InteractionRecordLink
            entityId={row.original.entityId}
            className={tableLink}
            aria-label={`Open interaction: ${row.original.summary}`}
            title={row.original.summary}
          >
            {row.original.summary}
          </InteractionRecordLink>
          <MeetingSourceLink source={sources[row.original.entityId]} className="flex" />
        </>
      ),
    }),
    column.accessor((row) => interactionTypes[row.kind].label, {
      id: "kind",
      header: "Type",
      meta: { width: "w-36" },
      cell: ({ row }) => {
        const { icon: Icon, label, textClass } = interactionTypes[row.original.kind];
        return (
          <span className="flex min-w-0 items-center gap-1.5" title={label}>
            <Icon aria-hidden className={`size-4 shrink-0 ${textClass}`} />
            <span className="truncate">{label}</span>
          </span>
        );
      },
    }),
    column.accessor((row) => interactionOrigins[row.origin].short, {
      id: "origin",
      header: "Origin",
      meta: { width: "w-28", hideBelow: "@3xl" },
      cell: ({ row }) => (
        <span
          className="block truncate text-muted-foreground"
          title={interactionOrigins[row.original.origin].long}
        >
          {interactionOrigins[row.original.origin].short}
        </span>
      ),
    }),
    column.accessor((row) => row.actor.displayName, {
      id: "loggedBy",
      header: "Logged by",
      meta: { width: "w-20", hideBelow: "@4xl" },
      cell: ({ getValue }) => (
        <span className="block truncate text-muted-foreground" title={getValue()}>
          {getValue()}
        </span>
      ),
    }),
  ]);
}

export function InteractionTable({
  rows,
  sources = emptySources,
  pagination,
  fetching,
}: {
  rows: InteractionRow[];
  /** The meetings that calendar interactions came from, by interaction. */
  sources?: InteractionSources;
  pagination: AppTablePagination;
  fetching: boolean;
}) {
  const columns = useMemo(() => interactionColumns(sources), [sources]);
  return (
    <AppTable
      name="Day’s interactions"
      columns={columns}
      data={rows}
      getRowId={(row) => row.entityId}
      pagination={pagination}
      fetching={fetching}
      empty={{
        title: "No interactions on this day",
        icon: Activity,
        description: "Select another bar to explore a different day.",
      }}
    />
  );
}
