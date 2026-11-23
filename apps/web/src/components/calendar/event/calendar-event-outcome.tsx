import type { CalendarEventDetail } from "@substrate/contracts/calendar";

import { Link } from "@tanstack/react-router";

import { useId } from "react";

import { useOrganizationApps } from "@/components/workspace/organization-apps";
import { meetingOutcomeSummary } from "@/lib/calendar/labels";
import { interactionLink, personLink } from "@/lib/navigation/record-links";
import { cn } from "cn";
import { CircleCheck, CircleSlash, Clock, Hourglass } from "lucide-react";

const icons = {
  upcoming: Clock,
  pending: Hourglass,
  recorded: CircleCheck,
  skipped: CircleSlash,
};

/** What this meeting does to contacts and interactions, and the interactions it created. */
export function CalendarEventOutcome({
  organizationId,
  outcome,
  kind,
  interactions,
}: {
  organizationId: string;
  outcome: CalendarEventDetail["outcome"];
  kind: CalendarEventDetail["kind"];
  interactions: CalendarEventDetail["interactions"];
}) {
  const id = useId();
  const crmEnabled = useOrganizationApps().enabled("crm");
  const { title, description } = meetingOutcomeSummary(outcome, kind);
  const Icon = icons[outcome.state];
  return (
    <section aria-labelledby={`${id}-title`} className="space-y-2">
      <h3 className="text-sm font-medium">Interactions</h3>
      <div className="space-y-3 rounded-lg border bg-card p-4">
        <div className="flex items-start gap-2.5">
          <Icon
            aria-hidden
            className={cn(
              "mt-0.5 size-4 shrink-0 text-muted-foreground",
              outcome.state === "recorded" && "text-success",
            )}
          />
          <div className="min-w-0 space-y-0.5">
            <p id={`${id}-title`} className="text-sm font-medium">
              {title}
            </p>
            <p className="text-sm text-muted-foreground">{description}</p>
            {outcome.state === "skipped" && outcome.reason === "before_interactions_from" && (
              <Link to="/settings/user/calendars" className="text-sm underline underline-offset-4">
                Open calendar settings
              </Link>
            )}
          </div>
        </div>
        {interactions.length > 0 && (
          <ul aria-label="Recorded interactions" className="divide-y border-t">
            {interactions.map((interaction) => (
              <li
                key={interaction.entityId}
                className="flex items-center justify-between gap-3 py-2 text-sm last:pb-0"
              >
                <Link
                  {...personLink(organizationId, interaction.contactEntityId, crmEnabled)}
                  className="min-w-0 truncate font-medium underline-offset-4 hover:underline"
                >
                  {interaction.contactName}
                </Link>
                <Link
                  {...interactionLink(organizationId, interaction.entityId)}
                  className="shrink-0 text-xs text-muted-foreground underline underline-offset-4"
                >
                  Open interaction
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
