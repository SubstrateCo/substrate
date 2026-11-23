import type { ProviderSyncResult } from "@substrate/contracts/calendar";

import {
  GoogleGone,
  GoogleNotFound,
  GoogleRateLimited,
  GoogleReauthRequired,
  GoogleScopeMissing,
  GoogleUnavailable,
} from "../../integrations/google";
import { ProviderNotImplemented } from "./errors";
import {
  CalendarSyncWorker,
  syncFailure,
  type CalendarSyncDependencies,
  type SyncFailure,
} from "./sync-worker";
import { expect, test } from "bun:test";

const synced: ProviderSyncResult = {
  fullSync: true,
  events: [],
  cancelledEventIds: [],
  nextCursor: "cursor",
};

interface Log {
  committed: string[];
  failed: ({ claim: string } & SyncFailure)[];
  recorded: string[];
  failures: string[];
}

function fixture(
  overrides: Partial<CalendarSyncDependencies<string, string>> & { queue?: string[] } = {},
) {
  const queue = [...(overrides.queue ?? [])];
  const log: Log = { committed: [], failed: [], recorded: [], failures: [] };
  const worker = new CalendarSyncWorker<string, string>({
    claim: async () => queue.shift() ?? null,
    fetch: async () => synced,
    commit: async (claim) => {
      log.committed.push(claim);
    },
    fail: async (claim, failure) => {
      log.failed.push({ claim, ...failure });
    },
    claimEndedMeetings: async () => [],
    recordMeeting: async (meeting) => {
      log.recorded.push(meeting);
    },
    reportFailure: (message) => {
      log.failures.push(message);
    },
    ...overrides,
  });
  return { worker, log, queue };
}

test("provider errors map to the calendar's failure outcome", () => {
  expect(syncFailure(new GoogleGone())).toEqual({ outcome: "reset", errorCode: "provider_gone" });
  expect(syncFailure(new GoogleReauthRequired())).toEqual({
    outcome: "reauth_required",
    errorCode: "reauth_required",
  });
  expect(syncFailure(new GoogleScopeMissing("calendar"))).toEqual({
    outcome: "reauth_required",
    errorCode: "calendar_scope_missing",
  });
  for (const error of [
    new ProviderNotImplemented(),
    new GoogleRateLimited(1000),
    new GoogleNotFound(),
    new GoogleUnavailable("provider_http_503", "Down", 503),
  ])
    expect(syncFailure(error)).toEqual({ outcome: "retry", errorCode: error.errorCode });
  // Unknown errors keep their details out of the stored code.
  expect(syncFailure(undefined)).toEqual({
    outcome: "retry",
    errorCode: "sync_failed",
  });
});

test("a failing calendar is recorded and the rest of the batch still syncs", async () => {
  const { worker, log } = fixture({
    queue: ["expired", "revoked", "crashed", "healthy"],
    fetch: async (claim) => {
      if (claim === "expired") throw new GoogleGone();
      if (claim === "revoked") throw new GoogleReauthRequired();
      if (claim === "crashed") throw new Error("token=secret");
      return synced;
    },
  });
  worker.trigger();
  await worker.idle();
  expect(log.failed).toEqual([
    { claim: "expired", outcome: "reset", errorCode: "provider_gone" },
    { claim: "revoked", outcome: "reauth_required", errorCode: "reauth_required" },
    // An unexpected error is retried, and its message is not stored.
    { claim: "crashed", outcome: "retry", errorCode: "sync_failed" },
  ]);
  expect(log.failures.join(" ")).not.toContain("secret");
  expect(log.committed).toEqual(["healthy"]);
});

test("a failed commit does not record a provider failure or stop the batch", async () => {
  const { worker, log } = fixture({
    queue: ["lost", "next"],
    commit: async (claim) => {
      if (claim === "lost") throw new Error("Database unavailable");
      log.committed.push(claim);
    },
  });
  worker.trigger();
  await worker.idle();
  expect(log.failed).toEqual([]);
  expect(log.committed).toEqual(["next"]);
  expect(log.failures).toHaveLength(1);
});

test("ended meetings are recorded after syncing, and one failure does not stop the others", async () => {
  const order: string[] = [];
  const { worker, log } = fixture({
    queue: ["calendar"],
    commit: async () => {
      order.push("commit");
    },
    claimEndedMeetings: async () => {
      order.push("meetings");
      return ["broken", "ended"];
    },
    recordMeeting: async (meeting) => {
      if (meeting === "broken") throw new Error("Constraint failed");
      log.recorded.push(meeting);
    },
  });
  worker.trigger();
  await worker.idle();
  // Meetings are recorded from events the same run committed.
  expect(order).toEqual(["commit", "meetings"]);
  expect(log.recorded).toEqual(["ended"]);
  expect(log.failures).toHaveLength(1);
});

test("a failed claim still runs the meeting step and does not block later runs", async () => {
  let fail = true;
  const { worker, log } = fixture({
    claim: async () => {
      if (fail) throw new Error("Database unavailable");
      return null;
    },
    claimEndedMeetings: async () => ["ended"],
  });
  worker.trigger();
  await worker.idle();
  expect(log.recorded).toEqual(["ended"]);
  fail = false;
  worker.trigger();
  await worker.idle();
  expect(log.recorded).toEqual(["ended", "ended"]);
  expect(log.failures).toHaveLength(1);
});

test("a trigger during a run starts one more run, so new calendars sync without waiting", async () => {
  const gate = Promise.withResolvers<void>();
  let claims = 0;
  const { worker } = fixture({
    claim: async () => {
      claims++;
      if (claims === 1) await gate.promise;
      return null;
    },
  });
  worker.trigger();
  worker.trigger();
  worker.trigger();
  gate.resolve();
  await worker.idle();
  expect(claims).toBe(2);
});
