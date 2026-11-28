import type { ProviderSyncResult } from "@substrate/contracts/calendar";

import { CalendarAccessRequired, CalendarCursorExpired, CalendarProviderError } from "./errors";

export interface SyncFailure {
  outcome: "retry" | "reauth_required" | "reset";
  errorCode: string;
}

export function syncFailure(error: CalendarProviderError | undefined): SyncFailure {
  if (error instanceof CalendarCursorExpired)
    return { outcome: "reset", errorCode: error.errorCode };
  if (error instanceof CalendarAccessRequired)
    return { outcome: "reauth_required", errorCode: error.errorCode };
  return { outcome: "retry", errorCode: error?.errorCode ?? "sync_failed" };
}

export interface CalendarSyncDependencies<Claim, Meeting> {
  claim(): Promise<Claim | null>;
  fetch(claim: Claim): Promise<ProviderSyncResult>;
  commit(claim: Claim, result: ProviderSyncResult): Promise<void>;
  fail(claim: Claim, failure: SyncFailure): Promise<void>;
  claimEndedMeetings(): Promise<Meeting[]>;
  recordMeeting(meeting: Meeting): Promise<void>;
  reportFailure(message: string): void;
}

const calendarSyncBatch = 10;

export class CalendarSyncWorker<Claim, Meeting> {
  private running: Promise<void> | undefined;
  private again = false;

  constructor(private readonly dependencies: CalendarSyncDependencies<Claim, Meeting>) {}

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
        const failure = syncFailure(error instanceof CalendarProviderError ? error : undefined);
        this.dependencies.reportFailure(`Calendar sync failed: ${failure.errorCode}.`);
        await this.dependencies.fail(claim, failure);
        continue;
      }
      try {
        await this.dependencies.commit(claim, result);
      } catch {
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
