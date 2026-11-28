import { useQuery } from "@tanstack/react-query";

import type { InteractionFilterId } from "./interaction-filters";
import type { OptionFilterField } from "@/components/filters";
import { useOrganizationApps } from "@/components/workspace/organization-apps-context";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import { calendarSettingsOptions } from "@/queries/calendar/options";
import { CalendarRange } from "lucide-react";

export function useSourceCalendarField(): OptionFilterField<InteractionFilterId>[] {
  const { organizationId } = useWorkspaceScope();
  const apps = useOrganizationApps();
  const enabled = apps.enabled("calendar");
  const query = useQuery({ ...calendarSettingsOptions(organizationId), enabled });
  if (!enabled) return [];
  return [
    {
      id: "sourceCalendar",
      label: "Source calendar",
      icon: CalendarRange,
      kind: "option",
      loading: query.isPending,
      error: query.error ? "Couldn’t load calendars" : undefined,
      emptyLabel: "No connected calendars",
      options: [
        ...(query.data?.accounts.flatMap((account) =>
          account.calendars.map((calendar) => ({
            value: calendar.entityId,
            label: calendar.name,
            group: account.email ?? undefined,
          })),
        ) ?? []),
        ...(query.data?.detachedCalendars.map((calendar) => ({
          value: calendar.entityId,
          label: calendar.name,
          group: "Disconnected accounts",
        })) ?? []),
      ],
    },
  ];
}
