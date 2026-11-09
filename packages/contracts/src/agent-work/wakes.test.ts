import { parseSessionKey, sessionKey, sessionKeys } from "./wakes.ts";
import { expect, test } from "bun:test";

test("session keys round-trip and reject unknown kinds or IDs", () => {
  const id = crypto.randomUUID();
  expect(parseSessionKey(sessionKeys.dm(id))).toEqual({ kind: "dm", id });
  expect(parseSessionKey(sessionKeys.thread(id))).toEqual({ kind: "thread", id });
  for (const key of [`channel:${id}`, "dm:not-a-uuid", `dm:${id}:extra`, `DM:${id}`, id])
    expect(parseSessionKey(key)).toBeNull();
  expect(sessionKey.safeParse(sessionKeys.routine(id)).success).toBe(true);
  expect(sessionKey.safeParse(`thread:${id} `).success).toBe(false);
});
