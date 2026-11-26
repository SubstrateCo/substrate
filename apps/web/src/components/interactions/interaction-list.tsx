import { ContactProfileLink, InteractionRecordLink } from "./interaction-link";
import { InteractionRow } from "./interaction-row";
import {
  emptySources,
  interactionOrigins,
  interactionTypes,
  type InteractionRow as Row,
  type InteractionSources,
} from "./interaction-types";
import { MeetingSourceLink } from "@/components/calendar/meeting-source-link";
import { Tag } from "@/components/feedback/tag";

export function InteractionList({
  rows,
  sources = emptySources,
}: {
  rows: Row[];
  /** The meetings that calendar interactions came from, by interaction. */
  sources?: InteractionSources;
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
              <ContactProfileLink
                contactEntityId={row.contactEntityId}
                className="underline-offset-4 hover:underline"
              >
                {row.contactName}
              </ContactProfileLink>
            }
            summary={
              <InteractionRecordLink
                entityId={row.entityId}
                className="underline-offset-4 hover:underline"
                aria-label={`Open interaction: ${row.summary}`}
              >
                {row.summary}
              </InteractionRecordLink>
            }
            details={[
              <span key="kind">{interactionTypes[row.kind].label}</span>,
              <span key="actor">Logged by {row.actor.displayName}</span>,
              ...(minutes === null ? [] : [<span key="minutes">{minutes} min recorded</span>]),
              <Tag key="origin">{interactionOrigins[row.origin].tag}</Tag>,
            ]}
            source={<MeetingSourceLink source={sources[row.entityId]} className="max-w-full" />}
          />
        );
      })}
    </ol>
  );
}
