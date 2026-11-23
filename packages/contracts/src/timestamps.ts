import { z } from "zod";

/** An absolute instant. Explicit offsets are accepted, then normalized to UTC. */
export const utcTimestamp = z.iso.datetime({ offset: true }).overwrite((value) => {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  // PostgreSQL cursors can distinguish instants within one JavaScript millisecond.
  const submillisecond = value.match(/\.(\d+)/)?.[1]?.slice(3) ?? "";
  return date.toISOString().replace(/Z$/, `${submillisecond}Z`);
});
