import { useMutation, useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "../keys";
import { connectCalendars, runCalendarAction, updateCalendar } from "@/api/calendar/requests";

function useCalendarInvalidation(organizationId: string) {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: queryKeys.calendar(organizationId) });
}

export function useConnectCalendars(organizationId: string) {
  const invalidate = useCalendarInvalidation(organizationId);
  return useMutation({
    mutationFn: (data: { credentialAccountId: string; providerCalendarIds: string[] }) =>
      connectCalendars({ data: { organizationId, ...data } }),
    onSuccess: invalidate,
  });
}

export function useUpdateCalendar(organizationId: string) {
  const invalidate = useCalendarInvalidation(organizationId);
  return useMutation({
    mutationFn: (data: {
      calendarEntityId: string;
      recordsInteractions?: boolean;
      paused?: boolean;
    }) => updateCalendar({ data: { organizationId, ...data } }),
    onSuccess: invalidate,
  });
}

export function useCalendarAction(organizationId: string) {
  const invalidate = useCalendarInvalidation(organizationId);
  return useMutation({
    mutationFn: (data: { calendarEntityId: string; action: "disconnect" | "backfill" }) =>
      runCalendarAction({ data: { organizationId, ...data } }),
    onSuccess: invalidate,
  });
}
