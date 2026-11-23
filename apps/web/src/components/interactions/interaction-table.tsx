import type { InteractionSourceEvent } from "@substrate/contracts/calendar";

import { Link } from "@tanstack/react-router";

import { interactionOrigins, interactionTypes, type InteractionRow } from "./interaction-types";
import { MeetingSourceLink } from "@/components/calendar/meeting-source-link";
import { Timestamp } from "@/components/time/timestamp";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function InteractionTable({
  rows,
  organizationId,
  sources = {},
}: {
  rows: InteractionRow[];
  organizationId: string;
  /** The meetings that calendar interactions came from, by interaction. */
  sources?: Readonly<Record<string, InteractionSourceEvent>>;
}) {
  return (
    <Table aria-label="Day’s interactions" className="min-w-xl table-fixed">
      <TableHeader>
        <TableRow>
          <TableHead className="w-20">Time</TableHead>
          <TableHead className="w-36 @3xl:w-56">Contact</TableHead>
          <TableHead>Summary</TableHead>
          <TableHead className="w-24">Type</TableHead>
          <TableHead className="hidden w-28 @3xl:table-cell">Origin</TableHead>
          <TableHead className="hidden w-20 @4xl:table-cell">Logged by</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const { icon: Icon, label, textClass } = interactionTypes[row.kind];
          return (
            <TableRow key={row.entityId}>
              <TableCell>
                <span className="text-muted-foreground">
                  <Timestamp value={row.occurredAt} format="time" />
                </span>
              </TableCell>
              <TableCell>
                <Link
                  from="/interactions/"
                  to="/interactions"
                  search={(previous) => ({
                    ...previous,
                    workspaceId: organizationId,
                    section: "person",
                    profileId: row.contactEntityId,
                    recordId: undefined,
                  })}
                  className="block truncate font-medium underline-offset-4 hover:underline"
                  title={row.contactName}
                >
                  {row.contactName}
                </Link>
              </TableCell>
              <TableCell>
                <Link
                  from="/interactions/"
                  to="/interactions"
                  search={(previous) => ({
                    ...previous,
                    workspaceId: organizationId,
                    recordId: row.entityId,
                  })}
                  className="block truncate underline-offset-4 hover:underline"
                  aria-label={`Open interaction: ${row.summary}`}
                  title={row.summary}
                >
                  {row.summary}
                </Link>
                <MeetingSourceLink
                  organizationId={organizationId}
                  source={sources[row.entityId]}
                  className="flex"
                />
              </TableCell>
              <TableCell>
                <span className="flex items-center gap-1.5">
                  <Icon aria-hidden className={`size-4 shrink-0 ${textClass}`} />
                  {label}
                </span>
              </TableCell>
              <TableCell className="hidden @3xl:table-cell">
                <span
                  className="block truncate text-muted-foreground"
                  title={interactionOrigins[row.origin].long}
                >
                  {interactionOrigins[row.origin].short}
                </span>
              </TableCell>
              <TableCell className="hidden @4xl:table-cell">
                <span className="block truncate text-muted-foreground">
                  {row.actor.displayName}
                </span>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
