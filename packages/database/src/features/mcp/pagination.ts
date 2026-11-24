import type { ActorScope } from "../../core/repository-context";
import { ValidationError } from "../../errors";
import { iso } from "./formatting";
import { sql, type SQL, type SQLWrapper } from "drizzle-orm";
import { createHash } from "node:crypto";

const maximumOffset = 1_000_000;

// A cursor is bound to the caller, the tool and every filter, so it cannot be replayed elsewhere.
function cursorCodec(scope: ActorScope, tool: string, input: { cursor?: string }) {
  const { cursor, ...filters } = input;
  const fingerprint = createHash("sha256")
    .update(JSON.stringify([scope, tool, filters]))
    .digest("hex");
  const invalid = () =>
    new ValidationError(
      "Invalid cursor or changed filters. Repeat the first call without a cursor.",
    );
  return {
    /** The position stored in the cursor, if it matches `pattern`. */
    position(pattern: RegExp): string | undefined {
      if (!cursor) return undefined;
      let value;
      try {
        value = JSON.parse(Buffer.from(cursor, "base64url").toString());
      } catch {
        throw invalid();
      }
      if (!Array.isArray(value) || value[0] !== fingerprint || !pattern.test(String(value[1])))
        throw invalid();
      return String(value[1]);
    },
    encode: (position: string) =>
      Buffer.from(JSON.stringify([fingerprint, position])).toString("base64url"),
  };
}

/**
 * Pages newest first by (time, ID), for queries sorted that way. The cursor holds the last item's
 * time in milliseconds and its ID, so each page reads only rows older than that point.
 */
export function newestFirstPagination(
  scope: ActorScope,
  tool: string,
  input: { cursor?: string; limit: number },
) {
  const codec = cursorCodec(scope, tool, input);
  const position = codec.position(/^\d{1,15}_[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/);
  const [ms, id] = position?.split("_") ?? [];
  return {
    before: position ? { at: new Date(Number(ms)).toISOString(), id: id! } : undefined,
    take: input.limit + 1,
    /** `position` reads a row's time in milliseconds and its ID, the order's sort key. */
    page<T>(rows: T[], position: (row: T) => { id: string; ms: number }) {
      const items = rows.slice(0, input.limit);
      const last = rows.length > input.limit ? items.at(-1) : undefined;
      if (last === undefined) return { items, nextCursor: null };
      const { ms, id } = position(last);
      return { items, nextCursor: codec.encode(`${ms}_${id}`) };
    },
  };
}

type NewestFirst = ReturnType<typeof newestFirstPagination>;

/** Whole milliseconds, so the SQL order, a merged page and the cursor agree on equal times. */
export const newest = (time: SQLWrapper) => sql<Date | string>`date_trunc('milliseconds', ${time})`;

/** Rows after the cursor in a `newest(time) desc, id desc` order. */
export function olderThan(p: NewestFirst, time: SQL, id: SQLWrapper) {
  return p.before
    ? sql`(${time}, ${id}) < (${p.before.at}::timestamptz, ${p.before.id}::uuid)`
    : undefined;
}

/** The cursor position of a row that selected its `newest(...)` sort time as `at`. */
export const position = (row: { id: string; at: Date | string }) => ({
  id: row.id,
  ms: Date.parse(iso(row.at)),
});

export function pagination(
  scope: ActorScope,
  tool: string,
  input: { cursor?: string; limit: number },
) {
  const codec = cursorCodec(scope, tool, input);
  const offset = Number(codec.position(/^\d{1,7}$/) ?? 0);
  if (offset > maximumOffset) throw new ValidationError("Invalid cursor or changed filters.");
  const next = (hasMore: boolean) => (hasMore ? codec.encode(String(offset + input.limit)) : null);
  return {
    offset,
    take: input.limit + 1,
    page<T>(rows: T[], hasMore = rows.length > input.limit) {
      return { items: rows.slice(0, input.limit), nextCursor: next(hasMore) };
    },
  };
}
