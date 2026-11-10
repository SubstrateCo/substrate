import { QueryClient } from "@tanstack/react-query";

import { messagePageOptions } from "./links";
import { afterEach, expect, spyOn, test } from "bun:test";

let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, "fetch">> | undefined;
afterEach(() => {
  fetchSpy?.mockRestore();
});

test("a new message's context page keeps the row objects of unchanged messages", async () => {
  const client = new QueryClient();
  const row = (messageId: string, title: string) => ({
    messageId,
    messaging: [],
    links: [{ entityId: `task-${messageId}`, title }],
    people: [],
  });
  let server = [row("one", "First"), row("two", "Second")];
  fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(async () => Response.json({ success: true, data: server }), {
      preconnect: globalThis.fetch.preconnect,
    }),
  );
  try {
    const before = await client.query(messagePageOptions("org", "conversation", ["one", "two"]));
    // The second message's link was renamed before the third message arrived.
    server = [row("one", "First"), row("two", "Renamed"), row("three", "Third")];
    const after = await client.query(
      messagePageOptions("org", "conversation", ["one", "two", "three"]),
    );
    expect(after[0]).toBe(before[0]!);
    expect(after[1]).not.toBe(before[1]!);
    expect<unknown>(after).toEqual(server);
    // Another conversation never shares rows, even for equal content.
    const other = await client.query(messagePageOptions("org", "other", ["one"]));
    expect(other[0]).not.toBe(after[0]!);
  } finally {
    client.clear();
  }
});
