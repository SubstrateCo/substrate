import { useId } from "react";

import { CalendarColorDot } from "../calendar-color";
import { ProviderIcon } from "../provider-icon";
import {
  hiddenCalendarsFrom,
  hiddenCalendarsValue,
  type CalendarFilterFieldId,
} from "./calendar-filter-value";
import { FilterBar, type FilterField } from "@/components/filters";
import { PageSidebarGroupTitle } from "@/components/layout/page-layout";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { CalendarGroup } from "@/lib/calendar/groups";
import { CalendarDays, Unlink } from "lucide-react";

function calendarFilterFields(
  groups: readonly CalendarGroup[],
): FilterField<CalendarFilterFieldId>[] {
  return [
    {
      id: "calendar",
      label: "Calendar",
      icon: CalendarDays,
      kind: "option",
      multiple: true,
      checks: "unchosen",
      operators: ["is not"],
      pluralLabel: "calendars",
      options: groups.flatMap((group) =>
        group.calendars.map((calendar) => ({
          value: calendar.entityId,
          label: calendar.name,
          icon: <CalendarColorDot color={calendar.color} />,
          group: group.label,
        })),
      ),
    },
  ];
}

export function CalendarFilterBar({
  groups,
  hidden,
  onHiddenChange,
}: {
  groups: readonly CalendarGroup[];
  hidden: ReadonlySet<string>;
  onHiddenChange: (hidden: ReadonlySet<string>) => void;
}) {
  return (
    <div className="shrink-0 border-b px-4 py-2">
      <FilterBar
        aria-label="Calendar filters"
        fields={calendarFilterFields(groups)}
        value={hiddenCalendarsValue(hidden, groups)}
        onValueChange={(value) => onHiddenChange(hiddenCalendarsFrom(value))}
      />
    </div>
  );
}

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
