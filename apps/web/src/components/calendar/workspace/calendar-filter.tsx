import { useId } from "react";

import { CalendarColorDot } from "../calendar-color";
import { ProviderIcon } from "../provider-icon";
import { PageSidebarGroupTitle } from "@/components/layout/page-layout";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { CalendarGroup } from "@/lib/calendar/groups";
import { Unlink } from "lucide-react";

/** Shows or hides each calendar's events, grouped by account. The choice stays on this screen only. */
export function CalendarFilter({
  groups,
  hidden,
  onToggle,
}: {
  groups: readonly CalendarGroup[];
  hidden: ReadonlySet<string>;
  onToggle: (calendarEntityId: string, visible: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="space-y-5">
      {groups.map((group, groupIndex) => (
        <section
          key={group.key}
          aria-labelledby={`${id}-${groupIndex}`}
          className="flex flex-col gap-0.5"
        >
          <PageSidebarGroupTitle id={`${id}-${groupIndex}`}>
            {group.provider ? (
              <ProviderIcon provider={group.provider} />
            ) : (
              <Unlink aria-hidden="true" className="size-4 shrink-0" />
            )}
            <span className="min-w-0 truncate" title={group.label}>
              {group.label}
            </span>
          </PageSidebarGroupTitle>
          <ul className="flex flex-col gap-0.5">
            {group.calendars.map((calendar) => {
              const checkboxId = `${id}-${calendar.entityId}`;
              return (
                <li key={calendar.entityId}>
                  <Label variant="row" htmlFor={checkboxId}>
                    <Checkbox
                      id={checkboxId}
                      checked={!hidden.has(calendar.entityId)}
                      onCheckedChange={(checked) => onToggle(calendar.entityId, checked === true)}
                    />
                    <CalendarColorDot color={calendar.color} />
                    <span className="min-w-0 flex-1 truncate" title={calendar.name}>
                      {calendar.name}
                    </span>
                    {calendar.syncStatus === "disconnected" && (
                      <span className="shrink-0 text-xs text-muted-foreground">Disconnected</span>
                    )}
                  </Label>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
