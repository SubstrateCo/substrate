import {
  claimCalendarSync,
  claimEndedMeetings,
  commitCalendarSync,
  failCalendarSync,
  recordMeetingInteractions,
  type CalendarSyncClaim,
} from "@substrate/database/calendar";
import type { Database } from "@substrate/database/trusted";

import type { CommittedPublisher } from "../../shared/committed";
import type { CalendarProviders } from "./providers";
import { CalendarSyncWorker } from "./sync-worker";

// Longer than one provider sync, so a lease outlives its run.
const leaseMs = 5 * 60_000;
const pollMs = 60_000;
const endedMeetingBatch = 50;

export function createCalendarSync(deps: {
  db: Database;
  publish: CommittedPublisher;
  providers: CalendarProviders;
}) {
  const { db, publish, providers } = deps;
  const worker = new CalendarSyncWorker<
    CalendarSyncClaim,
    Awaited<ReturnType<typeof claimEndedMeetings>>[number]
  >({
    claim: async () => publish(await claimCalendarSync(db, { leaseMs })),
    fetch: async (claim) =>
      providers.adapter(claim.provider).syncEvents(
        { userId: claim.ownerUserId, accountId: claim.credentialAccountId },
        {
          providerCalendarId: claim.providerCalendarId,
          syncCursor: claim.syncCursor,
          syncWindowStart: claim.syncWindowStart,
          now: new Date(),
        },
      ),
    commit: async (claim, result) => {
      await publish(await commitCalendarSync(db, { claim, result }));
    },
    fail: async (claim, { outcome, errorCode }) => {
      await publish(await failCalendarSync(db, { claim, outcome, errorCode }));
    },
    claimEndedMeetings: () => claimEndedMeetings(db, { limit: endedMeetingBatch }),
    recordMeeting: async (meeting) => {
      await publish(await recordMeetingInteractions(db, meeting));
    },
    reportFailure: (message) => console.warn(message),
  });

  function start() {
    worker.trigger();
    const timer = setInterval(() => worker.trigger(), pollMs);
    timer.unref();
    return async () => {
      clearInterval(timer);
      await worker.idle();
    };
  }
  return { worker, start };
}
