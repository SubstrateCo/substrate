import { Cron } from "croner";

function pattern(cron: string, timezone: string) {
  // Without a callback the job never schedules itself; it only computes run times.
  return new Cron(cron, { timezone, paused: true });
}

/** Whether a five-field cron expression parses. */
export function validCron(cron: string, timezone: string) {
  try {
    pattern(cron, timezone);
    return true;
  } catch {
    return false;
  }
}

/** The first occurrence strictly after the time, in the routine's IANA time zone. */
export function nextOccurrence(cron: string, timezone: string, after: number): number | null {
  return pattern(cron, timezone).nextRun(new Date(after))?.getTime() ?? null;
}

/**
 * The latest occurrence at or before now, starting from a due occurrence. Missed ticks collapse
 * into this one; the next fire time is the first occurrence after now.
 */
export function dueOccurrence(cron: string, timezone: string, due: number, now: number) {
  const job = pattern(cron, timezone);
  // previousRuns drops milliseconds and excludes its reference, so the next second includes now.
  const latest = job
    .previousRuns(1, new Date(now + 1000))
    .at(0)
    ?.getTime();
  return {
    occurrence: Math.max(due, latest ?? due),
    nextFireAt: job.nextRun(new Date(now))?.getTime() ?? null,
  };
}
