import type {
  AttendeeRole,
  CalendarAttendeeView,
  MeetingOutcome,
} from "@substrate/contracts/calendar";

import { Link } from "@tanstack/react-router";

import { useId } from "react";

import { Tag } from "@/components/feedback/tag";
import { PersonAvatar } from "@/components/people/person-avatar";
import { useOrganizationApps } from "@/components/workspace/organization-apps";
import { attendeeRoleLabel, sortAttendees } from "@/lib/calendar/labels";
import { personLink } from "@/lib/navigation/record-links";
import { cn } from "cn";
import { LogOut } from "lucide-react";

const roleTag: Partial<Record<AttendeeRole, string>> = {
  new_contact: "border-primary/40 bg-primary/5 text-primary",
  declined: "border-destructive/30 text-destructive",
};
// A skipped meeting adds no one, so its outside guests carry no highlight.
const tagClass = (role: AttendeeRole, outcome: MeetingOutcome["state"]) =>
  role === "new_contact" && outcome === "skipped" ? undefined : roleTag[role];

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
    <section aria-labelledby={`${id}-title`} className="space-y-2">
      <h3 id={`${id}-title`} className="text-sm font-medium">
        {`Guests · ${attendees.length}`}
      </h3>
      <ul className="divide-y overflow-hidden rounded-lg border">
        {sortAttendees(attendees).map((attendee) => {
          const name = attendee.contact?.displayName ?? attendee.displayName ?? attendee.email;
          const declined = attendee.role === "declined";
          return (
            <li key={attendee.email} className="flex items-center gap-3 px-3 py-2">
              {attendee.role === "resource" ? (
                <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                  <LogOut aria-hidden className="size-3.5" />
                </span>
              ) : (
                <PersonAvatar name={name} />
              )}
              <div className="min-w-0 flex-1">
                {attendee.role === "contact" && attendee.contact ? (
                  <Link
                    {...personLink(organizationId, attendee.contact.entityId, crmEnabled)}
                    className="block truncate text-sm font-medium underline-offset-4 hover:underline"
                  >
                    {name}
                  </Link>
                ) : (
                  <p
                    className={cn(
                      "truncate text-sm font-medium",
                      declined && "text-muted-foreground line-through",
                    )}
                  >
                    {name}
                  </p>
                )}
                {name !== attendee.email && (
                  <p className="truncate text-xs text-muted-foreground">{attendee.email}</p>
                )}
              </div>
              <div className="flex shrink-0 flex-wrap justify-end gap-1">
                {attendee.isOrganizer && <Tag>Organizer</Tag>}
                {attendee.isOptional && !declined && <Tag>Optional</Tag>}
                <Tag className={tagClass(attendee.role, outcome)}>
                  {attendeeRoleLabel(attendee.role, outcome)}
                </Tag>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
