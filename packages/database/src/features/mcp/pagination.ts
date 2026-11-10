import type { ActorScope } from "../../core/repository-context";
import { ValidationError } from "../../errors";
import { uuidPattern } from "../context/references";
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

/** Pages by the last item's ID, for queries that sort by ID. */
export function keysetPagination(
  scope: ActorScope,
  tool: string,
  input: { cursor?: string; limit: number },
) {
  const codec = cursorCodec(scope, tool, input);
  return {
    after: codec.position(uuidPattern),
    take: input.limit + 1,
    page<T extends { id: string }>(rows: T[]) {
      const items = rows.slice(0, input.limit);
      const last = items.at(-1);
      return {
        items,
        nextCursor: rows.length > input.limit && last ? codec.encode(last.id) : null,
      };
    },
  };
}

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
