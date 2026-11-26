import type { InteractionTimeline } from "@substrate/contracts/context/interactions";

import { oneOf, type FilterValue } from "./filters";
import { interactionKinds } from "./format";

export type InteractionDays = "all" | "7" | "30";
export type InteractionOrigin = "manual" | "message_publication" | "calendar_event";
type TimelinePeriod = Pick<InteractionTimeline, "from" | "until" | "allTime">;

export const interactionOrigins = [
  "manual",
  "message_publication",
  "calendar_event",
] as const satisfies readonly InteractionOrigin[];
const boundedDays = ["7", "30"] as const satisfies readonly InteractionDays[];

export function interactionPeriod(days: InteractionDays, now = new Date()) {
  const duration = days === "7" ? 7 : 30;
  const period: TimelinePeriod = {
    from: new Date(now.getTime() - duration * 86_400_000).toISOString(),
    until: now.toISOString(),
  };
  if (days === "all") period.allTime = "true";
  return period;
}

export type TimelineFilterId = "type" | "period" | "source";

/** The timeline query's filters. A field without a value does not restrict the timeline. */
export function timelineFilters(value: FilterValue<TimelineFilterId>) {
  return {
    kind: oneOf(value.type, interactionKinds),
    days: oneOf(value.period, boundedDays) ?? ("all" as const),
    origin: oneOf(value.source, interactionOrigins),
  };
}

export type DirectoryFilterId = "period" | "frequency";

/** The directory query's filters. A field without a value does not restrict the directory. */
export function directoryFilters(value: FilterValue<DirectoryFilterId>) {
  return {
    days: oneOf(value.period, boundedDays) ?? ("all" as const),
    frequency: oneOf(value.frequency, ["repeat"] as const) ?? ("all" as const),
  };
}
