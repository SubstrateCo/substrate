import type { InteractionTimeline } from "@substrate/contracts/context/interactions";

export type InteractionDays = "all" | "7" | "30";
export type InteractionOrigin = "manual" | "message_publication" | "calendar_event";
type TimelinePeriod = Pick<InteractionTimeline, "from" | "until" | "allTime">;

export function interactionPeriod(days: InteractionDays, now = new Date()) {
  const duration = days === "7" ? 7 : 30;
  const period: TimelinePeriod = {
    from: new Date(now.getTime() - duration * 86_400_000).toISOString(),
    until: now.toISOString(),
  };
  if (days === "all") period.allTime = "true";
  return period;
}
