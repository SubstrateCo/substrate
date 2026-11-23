import { googleProductScopes } from "../integrations/google.ts";
import type { ProviderCalendarEvent } from "./providers.ts";

export const calendarSyncStatuses = [
  "pending",
  "active",
  "error",
  "reauth_required",
  "paused",
  "disconnected",
] as const;
export type CalendarSyncStatus = (typeof calendarSyncStatuses)[number];

/** A meeting with more people than this, counting the owner and not rooms, is skipped. */
export const maxMeetingPeople = 15;
/** The first sync fetches this many days of past events, for display only. */
export const initialSyncPastDays = 30;
/** A backfill moves the sync window and the interaction start back this far. */
export const backfillPastDays = 365;
/** A full sync fetches events up to this many days ahead. */
export const syncFutureDays = 180;
/**
 * Google adds events from Gmail confirmation emails without checking for a matching invite, so a
 * booking tool that sends both an email and an invite, or travel the owner also entered by hand,
 * shows twice. Views hide a `from_gmail` event when the owner has another event starting within
 * this window. Booking emails and invites can round or shift the start, so an exact match misses.
 */
export const gmailDuplicateWindowMs = 15 * 60_000;
/** Polling interval for an active calendar. */
export const calendarSyncIntervalMs = 5 * 60_000;

/** The Google OAuth scope that calendar sync needs. The Google product registry owns it. */
export const googleCalendarScope = googleProductScopes.calendar[0];

/**
 * One sync run's changes. A full sync lists every event in the window, so events it does not list
 * are gone. An incremental sync names deleted events in `cancelledEventIds`, because providers
 * return only their IDs.
 */
export interface ProviderSyncResult {
  fullSync: boolean;
  events: ProviderCalendarEvent[];
  cancelledEventIds: string[];
  /** The cursor for the next incremental sync. */
  nextCursor: string | null;
}
