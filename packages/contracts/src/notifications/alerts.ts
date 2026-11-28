import type { ConversationKind } from "../messaging/input.ts";
import type {
  AccountNotificationPreferences,
  ConversationNotificationPreferences,
  NotificationLevel,
  NotificationSchedule,
  WorkspaceNotificationPreferences,
} from "./preferences.ts";

export type NotificationKind = "assignment" | "mention" | "reply" | "message";

/** A mute that lasts until the user turns it off. */
export const mutedIndefinitely = "9999-12-31T00:00:00.000Z";

const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function localTime(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return {
    day: weekdays.indexOf(part("weekday")),
    minute: Number(part("hour")) * 60 + Number(part("minute")),
  };
}

/** Whether the schedule allows alerts at this instant. */
export function withinSchedule(schedule: NotificationSchedule, now: Date) {
  const { day, minute } = localTime(now, schedule.timeZone);
  if (schedule.start < schedule.end)
    return schedule.days.includes(day) && minute >= schedule.start && minute < schedule.end;
  // The window crosses midnight: its early hours belong to the day before.
  if (minute >= schedule.start) return schedule.days.includes(day);
  return minute < schedule.end && schedule.days.includes((day + 6) % 7);
}

const active = (until: string | null, now: Date) =>
  until !== null && Date.parse(until) > now.getTime();

/** The level a conversation uses: its own, else the workspace level for channels, else all. */
export function conversationLevel(
  kind: ConversationKind,
  own: NotificationLevel | null,
  channels: NotificationLevel,
): NotificationLevel {
  return own ?? (kind === "channel" ? channels : "all");
}

/**
 * Whether a notification may show an operating system alert now. The notification stays in the
 * feed either way. `conversation` is null for task targets and for conversations the recipient
 * is not a member of.
 */
export function shouldAlert(input: {
  kind: NotificationKind;
  conversationKind: ConversationKind | null;
  conversation: ConversationNotificationPreferences | null;
  workspace: Omit<WorkspaceNotificationPreferences, "organizationId">;
  account: AccountNotificationPreferences;
  now: Date;
}) {
  const { account, workspace, conversation, now } = input;
  if (!account.alertsEnabled || active(account.pausedUntil, now)) return false;
  if (account.schedule && !withinSchedule(account.schedule, now)) return false;
  if (active(workspace.mutedUntil, now)) return false;
  if (input.kind === "assignment") return workspace.assignments;
  if (!input.conversationKind) return false;
  if (conversation && active(conversation.mutedUntil, now)) return false;
  const level = conversationLevel(
    input.conversationKind,
    conversation?.level ?? null,
    workspace.channels,
  );
  if (level === "nothing") return false;
  return level === "all" || input.kind !== "message";
}
