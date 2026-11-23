import type { CalendarAttendeeView, MeetingOutcome } from "@substrate/contracts/calendar";

import { Link } from "@tanstack/react-router";

import { useId } from "react";

import { Tag } from "@/components/feedback/tag";
import { RecordSection, recordRows } from "@/components/layout/record-section";
import { PersonAvatar } from "@/components/people/person-avatar";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { useOrganizationApps } from "@/components/workspace/organization-apps";
import { attendeeRoleLabel, sortAttendees } from "@/lib/calendar/labels";
import { personLink } from "@/lib/navigation/record-links";
import { cn } from "cn";
import { MapPin } from "lucide-react";

/** The event's guests, each with what Substrate knows about them. */
export function CalendarAttendees({
  organizationId,
  attendees,
  outcome,
}: {
  organizationId: string;
  attendees: readonly CalendarAttendeeView[];
  /** What the meeting does to interactions, which decides whether outside guests become contacts. */
  outcome: MeetingOutcome["state"];
}) {
  const id = useId();
  const crmEnabled = useOrganizationApps().enabled("crm");
  if (!attendees.length) return null;
  return (
    <RecordSection
      aria-labelledby={`${id}-title`}
      title={<span id={`${id}-title`}>Guests</span>}
      count={attendees.length}
    >
      <ul className={recordRows}>
        {sortAttendees(attendees).map((attendee) => {
          const name = attendee.contact?.displayName ?? attendee.displayName ?? attendee.email;
          const declined = attendee.role === "declined";
          return (
            <Item key={attendee.email} asChild size="xs">
              <li>
                <ItemMedia>
                  {attendee.role === "resource" ? (
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                      <MapPin aria-hidden className="size-3.5" />
                    </span>
                  ) : (
                    <PersonAvatar name={name} />
                  )}
                </ItemMedia>
                <ItemContent className="min-w-0">
                  <ItemTitle className="max-w-full">
                    {attendee.role === "contact" && attendee.contact ? (
                      <Link
                        {...personLink(organizationId, attendee.contact.entityId, crmEnabled)}
                        className="truncate underline-offset-4 hover:underline"
                      >
                        {name}
                      </Link>
                    ) : (
                      <span
                        className={cn("truncate", declined && "text-muted-foreground line-through")}
                      >
                        {name}
                      </span>
                    )}
                  </ItemTitle>
                  {name !== attendee.email && <ItemDescription>{attendee.email}</ItemDescription>}
                </ItemContent>
                <ItemActions className="flex-wrap justify-end">
                  {attendee.isOrganizer && <Tag>Organizer</Tag>}
                  {attendee.isOptional && !declined && <Tag>Optional</Tag>}
                  <Tag>{attendeeRoleLabel(attendee.role, outcome)}</Tag>
                </ItemActions>
              </li>
            </Item>
          );
        })}
      </ul>
    </RecordSection>
  );
}
