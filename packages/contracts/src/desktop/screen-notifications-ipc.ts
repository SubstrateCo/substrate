import type { BridgeAPI } from "./ipc.ts";
import { z } from "zod";

// Screen notifications are cards in a transparent, always-on-top overlay window. Producers live in
// the main process; the overlay only renders cards and reports actions by ID. It never receives
// URLs: main resolves and checks any target itself.

/** Overlay → main requests. */
export const channel = "substrate:screen-notifications";
/** Main → overlay events. */
export const eventChannel = "substrate:screen-notifications:event";

const id = z.string().min(1).max(200);
const base = {
  /** A stable dedupe key, such as `meeting:<entityId>:<startsAt>`. */
  id,
  priority: z.enum(["normal", "high"]),
  createdAt: z.iso.datetime(),
  /** Main removes the card at this time. */
  expiresAt: z.iso.datetime(),
};

export const screenNotificationAction = z.enum(["join", "open", "snooze", "dismiss"]);
export type ScreenNotificationAction = z.infer<typeof screenNotificationAction>;

export const meetingNotification = z.object({
  ...base,
  kind: z.literal("meeting"),
  payload: z.object({
    title: z.string().max(500),
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime(),
    calendarName: z.string().max(200),
    color: z.string().max(32).nullable(),
    phase: z.enum(["upcoming", "started"]),
    /** True only when main's allowlist accepts the meeting's conference URL. */
    joinable: z.boolean(),
  }),
  actions: z.array(screenNotificationAction).max(4),
});
export type MeetingNotification = z.infer<typeof meetingNotification>;

// Add new kinds to this union, to main's action registry, and to the overlay's view map.
export const screenNotification = z.discriminatedUnion("kind", [meetingNotification]);
export type ScreenNotification = z.infer<typeof screenNotification>;
export type ScreenNotificationKind = ScreenNotification["kind"];

export const screenNotificationEvent = z.discriminatedUnion("type", [
  z.object({ type: z.literal("upsert"), notification: screenNotification }),
  z.object({ type: z.literal("remove"), id }),
]);
export type ScreenNotificationEvent = z.infer<typeof screenNotificationEvent>;

export const methods = {
  /** The overlay loaded: returns the cards to show now. */
  ready: { input: z.undefined(), output: z.array(screenNotification) },
  act: { input: z.object({ id, action: screenNotificationAction }) },
  /** The pointer entered (true) or left (false) the card stack. */
  setInteractive: { input: z.boolean() },
};
export type ScreenNotificationsAPI = BridgeAPI<typeof methods>;

/** The overlay preload's API: requests plus a subscription to main's events. */
export interface ScreenNotificationsBridge extends ScreenNotificationsAPI {
  onEvent(listener: (event: ScreenNotificationEvent) => void): () => void;
}

/** Device-local meeting reminder preferences. */
export const reminderLeadMinutes = [0, 1, 2, 5, 10] as const;
export const meetingReminderSettings = z.object({
  enabled: z.boolean(),
  leadMinutes: z.union(reminderLeadMinutes.map((value) => z.literal(value))),
});
export type MeetingReminderSettings = z.infer<typeof meetingReminderSettings>;
export const defaultMeetingReminderSettings: MeetingReminderSettings = {
  enabled: true,
  leadMinutes: 1,
};
