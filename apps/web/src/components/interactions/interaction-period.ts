import type { InteractionPeriod } from "@substrate/contracts/context/interactions";

import { formatDateOnly, parseDateOnly } from "@/lib/format/date";

export function interactionDay(period: InteractionPeriod, day: string): InteractionPeriod {
  const start = parseDateOnly(day)!;
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
  return { ...period, from: start.toISOString(), until: end.toISOString() };
}

export function interactionWindow(organizationId: string, days: number, now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days + 1);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const dates = Array.from({ length: days }, (_, i) =>
    formatDateOnly(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)),
  );
  const period: InteractionPeriod = {
    organizationId,
    from: start.toISOString(),
    until: end.toISOString(),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
  return { period, dates };
}
