import type {
  CalendarAccountView,
  CalendarProvider,
  CalendarSettingsView,
  CalendarView,
} from "@substrate/contracts/calendar";

import { providerLabels } from "./labels";

export interface CalendarGroup {
  key: string;
  label: string;
  /** The account's provider. Null for calendars whose account was removed. */
  provider: CalendarProvider | null;
  calendars: CalendarView[];
}

/** The account's email, or "Google account" when the provider did not share one. */
export function calendarAccountName(account: Pick<CalendarAccountView, "email" | "provider">) {
  return account.email ?? `${providerLabels[account.provider]} account`;
}

const calendarNames = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function sortCalendars(calendars: readonly CalendarView[]) {
  return [...calendars].sort(
    (a, b) => Number(b.isPrimary) - Number(a.isPrimary) || calendarNames.compare(a.name, b.name),
  );
}

/**
 * Calendars under the account they sync from, in the settings' account order, with each
 * account's primary calendar first. Calendars whose account was removed come last.
 */
export function groupCalendarsByAccount(
  settings: Pick<CalendarSettingsView, "accounts" | "detachedCalendars">,
): CalendarGroup[] {
  const groups = settings.accounts
    .filter((account) => account.calendars.length > 0)
    .map((account): CalendarGroup => ({
      key: account.credentialAccountId,
      label: calendarAccountName(account),
      provider: account.provider,
      calendars: sortCalendars(account.calendars),
    }));
  if (settings.detachedCalendars.length > 0)
    groups.push({
      key: "detached",
      label: "Disconnected accounts",
      provider: null,
      calendars: sortCalendars(settings.detachedCalendars),
    });
  return groups;
}
