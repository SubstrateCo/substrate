import { mutedIndefinitely } from "@substrate/contracts/notifications/alerts";
import type { NotificationLevel } from "@substrate/contracts/notifications/preferences";

export const levelLabels: Record<NotificationLevel, string> = {
  all: "All",
  mentions: "Mentions",
  nothing: "Nothing",
};

/** How long a pause or mute lasts. "forever" lasts until the user turns it off. */
export type MuteChoice = "off" | "30m" | "1h" | "8h" | "24h" | "tomorrow" | "forever";

export const muteLabels: Record<MuteChoice, string> = {
  off: "Off",
  "30m": "30 minutes",
  "1h": "1 hour",
  "8h": "8 hours",
  "24h": "24 hours",
  tomorrow: "Until tomorrow at 9:00 AM",
  forever: "Until I turn it back on",
};

const hour = 60 * 60 * 1000;
const durations: Partial<Record<MuteChoice, number>> = {
  "30m": hour / 2,
  "1h": hour,
  "8h": 8 * hour,
  "24h": 24 * hour,
};

/** The end of a pause or mute that starts now, or null to turn it off. */
export function muteUntil(choice: MuteChoice, now: Date = new Date()): string | null {
  if (choice === "off") return null;
  if (choice === "forever") return mutedIndefinitely;
  if (choice === "tomorrow") {
    const next = new Date(now);
    next.setDate(next.getDate() + 1);
    next.setHours(9, 0, 0, 0);
    return next.toISOString();
  }
  return new Date(now.getTime() + durations[choice]!).toISOString();
}

export type MuteState = { kind: "off" } | { kind: "forever" } | { kind: "until"; until: string };

/** Whether a stored end silences alerts now. A past end is off. */
export function muteState(until: string | null, now: Date = new Date()): MuteState {
  if (until === null || Date.parse(until) <= now.getTime()) return { kind: "off" };
  if (until === mutedIndefinitely) return { kind: "forever" };
  return { kind: "until", until };
}
