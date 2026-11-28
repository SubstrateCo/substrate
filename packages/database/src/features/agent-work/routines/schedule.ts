import { Cron } from "croner";

function pattern(cron: string, timezone: string) {
  // Without a callback the job never schedules itself; it only computes run times.
  return new Cron(cron, { timezone, paused: true });
}

export function validCron(cron: string, timezone: string) {
  try {
    pattern(cron, timezone);
    return true;
  } catch {
    return false;
  }
}

export function nextOccurrence(cron: string, timezone: string, after: Date): Date | null {
  return pattern(cron, timezone).nextRun(after);
}

export function dueOccurrence(cron: string, timezone: string, due: Date, now: Date) {
  const job = pattern(cron, timezone);
  // previousRuns drops milliseconds and excludes its reference, so the next second includes now.
  const latest = job
    .previousRuns(1, new Date(now.getTime() + 1000))
    .at(0)
    ?.getTime();
  return {
    occurrence: new Date(Math.max(due.getTime(), latest ?? due.getTime())),
    nextFireAt: job.nextRun(now),
  };
}
