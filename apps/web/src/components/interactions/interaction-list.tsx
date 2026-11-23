import type { InteractionSourceEvent } from "@substrate/contracts/calendar";

import { Link } from "@tanstack/react-router";

import { InteractionRow } from "./interaction-row";
import {
  interactionOrigins,
  interactionTypes,
  type InteractionRow as Row,
} from "./interaction-types";
import { MeetingSourceLink } from "@/components/calendar/meeting-source-link";
import { Tag } from "@/components/feedback/tag";

export function InteractionList({
  rows,
  organizationId,
  sources = {},
}: {
  rows: Row[];
  organizationId: string;
  /** The meetings that calendar interactions came from, by interaction. */
  sources?: Readonly<Record<string, InteractionSourceEvent>>;
}) {
  return (
    <ol aria-label="Interactions" className="grid gap-px">
      {rows.map((row) => {
        const minutes = row.endedAt
          ? Math.round((Date.parse(row.endedAt) - Date.parse(row.occurredAt)) / 60000)
          : null;
        return (
          <InteractionRow
            key={row.entityId}
            icon
            kind={row.kind}
            occurredAt={row.occurredAt}
            contact={
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
                className="underline-offset-4 hover:underline"
              >
                {row.contactName}
              </Link>
            }
            summary={
              <Link
                from="/interactions/"
                to="/interactions"
                search={(previous) => ({
                  ...previous,
                  workspaceId: organizationId,
                  recordId: row.entityId,
                })}
                className="underline-offset-4 hover:underline"
                aria-label={`Open interaction: ${row.summary}`}
              >
                {row.summary}
              </Link>
            }
            details={[
              <span key="kind">{interactionTypes[row.kind].label}</span>,
              <span key="actor">Logged by {row.actor.displayName}</span>,
              ...(minutes === null ? [] : [<span key="minutes">{minutes} min recorded</span>]),
              <Tag key="origin">{interactionOrigins[row.origin].tag}</Tag>,
            ]}
            source={
              <MeetingSourceLink
                organizationId={organizationId}
                source={sources[row.entityId]}
                className="max-w-full"
              />
            }
          />
        );
      })}
    </ol>
  );
}
