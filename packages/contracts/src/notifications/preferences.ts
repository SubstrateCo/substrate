import { knownTimeZone, utcTimestamp } from "../timestamps.ts";
import { organizationId } from "../workspace.ts";
import { z } from "zod";

/** Which conversation events alert: every message, only mentions and replies, or none. */
export const notificationLevels = ["all", "mentions", "nothing"] as const;
export type NotificationLevel = (typeof notificationLevels)[number];
/** How much of a message an operating system alert shows. */
export const notificationPreviews = ["hidden", "sender", "full"] as const;
export type NotificationPreview = (typeof notificationPreviews)[number];
/** When the taskbar or dock flashes for an alert. "idle" flashes only after the user is away. */
export const notificationFlashModes = ["idle", "always", "never"] as const;
export type NotificationFlashMode = (typeof notificationFlashModes)[number];

const minuteOfDay = z.number().int().min(0).max(1439);

/**
 * Hours that allow alerts. Days are 0 (Sunday) to 6. An end before the start crosses midnight, and
 * the window belongs to the day it starts on.
 */
export const notificationSchedule = z
  .object({
    days: z
      .array(z.number().int().min(0).max(6))
      .min(1)
      .max(7)
      .refine((days) => new Set(days).size === days.length, "Days must be unique."),
    start: minuteOfDay,
    end: minuteOfDay,
    timeZone: z.string().min(1).max(100).refine(knownTimeZone, "Unknown time zone."),
  })
  .strict()
  .refine((schedule) => schedule.start !== schedule.end, "Start and end must differ.");
export type NotificationSchedule = z.output<typeof notificationSchedule>;

/** Settings that apply in every workspace of the account. */
export const accountNotificationPreferences = z.object({
  alertsEnabled: z.boolean(),
  pausedUntil: utcTimestamp.nullable(),
  schedule: notificationSchedule.nullable(),
  preview: z.enum(notificationPreviews),
  sound: z.boolean(),
  flash: z.enum(notificationFlashModes),
});
export type AccountNotificationPreferences = z.output<typeof accountNotificationPreferences>;

export const defaultAccountNotificationPreferences: AccountNotificationPreferences = {
  alertsEnabled: true,
  pausedUntil: null,
  schedule: null,
  preview: "hidden",
  sound: true,
  flash: "idle",
};

export const updateAccountNotificationPreferences = accountNotificationPreferences
  .partial()
  .strict();

/** The account's settings in one workspace. `channels` is the level for channels. */
export const workspaceNotificationPreferences = z.object({
  organizationId,
  channels: z.enum(notificationLevels),
  mutedUntil: utcTimestamp.nullable(),
  assignments: z.boolean(),
});
export type WorkspaceNotificationPreferences = z.output<typeof workspaceNotificationPreferences>;

export const defaultWorkspaceNotificationPreferences: Omit<
  WorkspaceNotificationPreferences,
  "organizationId"
> = { channels: "mentions", mutedUntil: null, assignments: true };

export const updateWorkspaceNotificationPreferences = workspaceNotificationPreferences
  .omit({ organizationId: true })
  .partial()
  .extend({ organizationId })
  .strict();

/** A member's own settings for one conversation. A null level follows the default. */
export const conversationNotificationPreferences = z.object({
  level: z.enum(notificationLevels).nullable(),
  mutedUntil: utcTimestamp.nullable(),
});
export type ConversationNotificationPreferences = z.output<
  typeof conversationNotificationPreferences
>;

export const notificationWorkspace = z.object({ organizationId });
export const conversationNotificationParams = z.object({ conversationId: z.uuid() });

export const updateConversationNotificationPreferences = conversationNotificationPreferences
  .partial()
  .extend({ organizationId })
  .strict();
