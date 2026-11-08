import { ValidationError } from "../../errors";
import { createHash } from "node:crypto";

export function pagination(
  scope: { organizationId: string; actorEntityId: string },
  tool: string,
  input: { cursor?: string; limit: number },
) {
  const { cursor, ...filters } = input;
  const fingerprint = createHash("sha256")
    .update(JSON.stringify([scope, tool, filters]))
    .digest("hex");
  let offset = 0;
  if (cursor) {
    try {
      const value: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString());
      if (
        !Array.isArray(value) ||
        value[0] !== fingerprint ||
        !Number.isSafeInteger(value[1]) ||
        value[1] < 0 ||
        value[1] > 1_000_000
      )
        throw new Error();
      offset = value[1];
    } catch {
      throw new ValidationError("Invalid cursor or changed filters.");
    }
  }
  const next = (hasMore: boolean) =>
    hasMore
      ? Buffer.from(JSON.stringify([fingerprint, offset + input.limit])).toString("base64url")
      : null;
  return {
    offset,
    take: input.limit + 1,
    page<T>(rows: T[], hasMore = rows.length > input.limit) {
      return { items: rows.slice(0, input.limit), nextCursor: next(hasMore) };
    },
  };
}
