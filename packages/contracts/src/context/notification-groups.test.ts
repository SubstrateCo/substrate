import { notificationGroupsInput } from "./notification-groups.ts";
import { expect, test } from "bun:test";

const id = "00000000-0000-4000-8000-000000000001";

test("group cursors must be a JSON position with an offset timestamp and a UUID", () => {
  const page = (after: string) =>
    notificationGroupsInput.safeParse({ organizationId: "org", after });
  expect(page(JSON.stringify({ at: "2026-11-10T10:00:00.000001Z", id })).success).toBe(true);
  for (const after of [id, "{}", JSON.stringify({ at: "invalid", id })])
    expect(page(after).success).toBe(false);
});
