import type { ProviderSyncResult } from "@substrate/contracts/calendar";

import {
  GoogleError,
  GoogleGone,
  GoogleReauthRequired,
  GoogleScopeMissing,
} from "../../integrations/google";
import { CalendarProviderError, type ProviderFailure } from "./errors";

export interface SyncFailure {
  outcome: "retry" | "reauth_required" | "reset";
  /** Stored on the calendar. Never contains provider details. */
  errorCode: string;
}

/**
 * How a failed sync is recorded. An expired cursor resets the calendar to a full sync, a grant
 * the owner must renew stops it, and everything else is retried. Unknown errors keep their
 * details out of the stored code.
 */
export function syncFailure(error: ProviderFailure | undefined): SyncFailure {
  if (error instanceof GoogleGone) return { outcome: "reset", errorCode: error.errorCode };
  if (error instanceof GoogleReauthRequired || error instanceof GoogleScopeMissing)
    return { outcome: "reauth_required", errorCode: error.errorCode };
  return { outcome: "retry", errorCode: error?.errorCode ?? "sync_failed" };
}

export interface CalendarSyncDependencies<Claim, Meeting> {
  /** Leases the next due calendar, or returns null. */
  claim(): Promise<Claim | null>;
  /** Fetches the calendar's changes from its provider, outside any transaction. */
  fetch(claim: Claim): Promise<ProviderSyncResult>;
  commit(claim: Claim, result: ProviderSyncResult): Promise<void>;
  fail(claim: Claim, failure: SyncFailure): Promise<void>;
  claimEndedMeetings(): Promise<Meeting[]>;
  recordMeeting(meeting: Meeting): Promise<void>;
  reportFailure(message: string): void;
}

/** Calendars synced per run. Each one holds a lease, so a small batch keeps leases short. */
export const calendarSyncBatch = 10;

export class CalendarSyncWorker<Claim, Meeting> {
  private running: Promise<void> | undefined;
  private again = false;

  constructor(private readonly dependencies: CalendarSyncDependencies<Claim, Meeting>) {}

  /** Starts a run. A trigger during a run starts one more run after it, so new work is seen. */
  trigger() {
    if (this.running) {
      this.again = true;
      return;
    }
    this.running = this.run().finally(() => {
      this.running = undefined;
      if (!this.again) return;
      this.again = false;
      this.trigger();
    });
  }

  async idle() {
    while (this.running) await this.running;
  }

  private async run() {
    try {
      await this.syncCalendars();
    } catch {
      this.dependencies.reportFailure("Calendar sync is unavailable; it will be retried.");
    }
    try {
      await this.recordMeetings();
    } catch {
      this.dependencies.reportFailure(
        "Meeting interactions are unavailable; they will be retried.",
      );
    }
  }

  private async syncCalendars() {
    for (let i = 0; i < calendarSyncBatch; i++) {
      const claim = await this.dependencies.claim();
      if (!claim) return;
      let result: ProviderSyncResult;
      try {
        result = await this.dependencies.fetch(claim);
      } catch (error) {
        const known = error instanceof GoogleError || error instanceof CalendarProviderError;
        const failure = syncFailure(known ? error : undefined);
        this.dependencies.reportFailure(`Calendar sync failed: ${failure.errorCode}.`);
        await this.dependencies.fail(claim, failure);
        continue;
      }
      try {
        await this.dependencies.commit(claim, result);
      } catch {
        // The lease expires and a later run fetches the changes again.
        this.dependencies.reportFailure("Calendar sync could not be saved; it will be retried.");
      }
    }
  }

  private async recordMeetings() {
    for (const meeting of await this.dependencies.claimEndedMeetings()) {
      try {
        await this.dependencies.recordMeeting(meeting);
      } catch {
        this.dependencies.reportFailure("A meeting interaction failed; it will be retried.");
      }
    }
  }
}
