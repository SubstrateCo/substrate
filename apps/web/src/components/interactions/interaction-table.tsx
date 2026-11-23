import type { InteractionSourceEvent } from "@substrate/contracts/calendar";

import { Link } from "@tanstack/react-router";

import { useMemo } from "react";

import { interactionOrigins, interactionTypes, type InteractionRow } from "./interaction-types";
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
const emptySources: Readonly<Record<string, InteractionSourceEvent>> = {};

function interactionColumns(
  organizationId: string,
  sources: Readonly<Record<string, InteractionSourceEvent>>,
) {
  return column.columns([
    column.accessor("occurredAt", {
      header: "Time",
      meta: { width: "w-20" },
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          <Timestamp value={row.original.occurredAt} format="time" />
        </span>
      ),
    }),
    column.accessor("contactName", {
      header: "Contact",
      meta: { width: "w-36" },
      cell: ({ row }) => (
        <Link
          from="/interactions/"
          to="/interactions"
          search={(previous) => ({
            ...previous,
            workspaceId: organizationId,
            section: "person",
            profileId: row.original.contactEntityId,
            recordId: undefined,
          })}
          className={tableLink}
          title={row.original.contactName}
        >
          {row.original.contactName}
        </Link>
      ),
    }),
    column.accessor("summary", {
      header: "Summary",
      cell: ({ row }) => (
        <>
          <Link
            from="/interactions/"
            to="/interactions"
            search={(previous) => ({
              ...previous,
              workspaceId: organizationId,
              recordId: row.original.entityId,
            })}
            className="block truncate underline-offset-4 hover:underline"
            aria-label={`Open interaction: ${row.original.summary}`}
            title={row.original.summary}
          >
            {row.original.summary}
          </Link>
          <MeetingSourceLink
            organizationId={organizationId}
            source={sources[row.original.entityId]}
            className="flex"
          />
        </>
      ),
    }),
    column.accessor((row) => interactionTypes[row.kind].label, {
      id: "kind",
      header: "Type",
      meta: { width: "w-24" },
      cell: ({ row }) => {
        const { icon: Icon, label, textClass } = interactionTypes[row.original.kind];
        return (
          <span className="flex items-center gap-1.5">
            <Icon aria-hidden className={`size-4 shrink-0 ${textClass}`} />
            {label}
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
        <span className="block truncate text-muted-foreground">{getValue()}</span>
      ),
    }),
  ]);
}

export function InteractionTable({
  rows,
  organizationId,
  sources = emptySources,
  pagination,
  fetching,
}: {
  rows: InteractionRow[];
  organizationId: string;
  /** The meetings that calendar interactions came from, by interaction. */
  sources?: Readonly<Record<string, InteractionSourceEvent>>;
  pagination: AppTablePagination;
  fetching: boolean;
}) {
  const columns = useMemo(
    () => interactionColumns(organizationId, sources),
    [organizationId, sources],
  );
  return (
    <AppTable
      name="Day’s interactions"
      layout="fixed"
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
