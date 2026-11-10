import { QueryClient } from "@tanstack/react-query";

import { queryKeys } from "../keys";
import { messagePageOptions } from "./links";
import { afterEach, expect, spyOn, test } from "bun:test";
import { z } from "zod";

let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, "fetch">> | undefined;
afterEach(() => {
  fetchSpy?.mockRestore();
});

const pageRow = (messageId: string) => ({
  messageId,
  messaging: [],
  links: [{ entityId: `task-${messageId}`, title: messageId }],
  people: [],
});

const requestBody = z.object({ messageIds: z.array(z.string()) });

// Fakes the server and records the message IDs of each request.
const fakeMessagePageServer = (row = pageRow) => {
  const requests: string[][] = [];
  fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = requestBody.parse(await new Response(init?.body).json());
        requests.push(body.messageIds);
        return Response.json({ success: true, data: body.messageIds.map(row) });
      },
      { preconnect: globalThis.fetch.preconnect },
    ),
  );
  return requests;
};

test("a new message's context page requests only the IDs no cached page covers", async () => {
  const client = new QueryClient();
  const requests = fakeMessagePageServer();
  try {
    await client.query(messagePageOptions("org", "conversation", ["a", "b"]));
    const after = await client.query(messagePageOptions("org", "conversation", ["a", "b", "c"]));
    expect(requests).toEqual([["a", "b"], ["c"]]);
    expect(after.map((row) => row.messageId)).toEqual(["a", "b", "c"]);
  } finally {
    client.clear();
  }
});

test("overlapping pages reuse the most recently refreshed message context", async () => {
  const client = new QueryClient();
  let title = "Original";
  const requests = fakeMessagePageServer((id) => ({
    ...pageRow(id),
    links: [{ entityId: `task-${id}`, title }],
  }));
  try {
    const first = messagePageOptions("org", "conversation", ["a", "b"]);
    const second = messagePageOptions("org", "conversation", ["a", "b", "c"]);
    await client.query(first);
    await client.query(second);
    title = "Renamed";
    const refreshed = await client.query({ ...first, staleTime: 0 });
    // Make the relative refresh times explicit, independent of the system clock's resolution.
    client.setQueryData(second.queryKey, client.getQueryData(second.queryKey), { updatedAt: 1 });
    client.setQueryData(first.queryKey, refreshed, { updatedAt: 2 });
    const after = await client.query(
      messagePageOptions("org", "conversation", ["a", "b", "c", "d"]),
    );
    expect(after[0]!.links[0]!.title).toBe("Renamed");
    expect(after[1]!.links[0]!.title).toBe("Renamed");
    expect(requests).toEqual([["a", "b"], ["c"], ["a", "b"], ["d"]]);
  } finally {
    client.clear();
  }
});

test("an invalidated context page is not reused", async () => {
  const client = new QueryClient();
  const requests = fakeMessagePageServer();
  try {
    await client.query(messagePageOptions("org", "conversation", ["a", "b"]));
    await client.invalidateQueries({ queryKey: queryKeys.messagePages("org", "conversation") });
    const after = await client.query(messagePageOptions("org", "conversation", ["a", "b", "c"]));
    expect(requests).toEqual([
      ["a", "b"],
      ["a", "b", "c"],
    ]);
    expect(after.map((row) => row.messageId)).toEqual(["a", "b", "c"]);
  } finally {
    client.clear();
  }
});

test("a context page that refetches requests every ID", async () => {
  const client = new QueryClient();
  const requests = fakeMessagePageServer();
  try {
    await client.query(messagePageOptions("org", "conversation", ["a", "b"]));
    await client.query({ ...messagePageOptions("org", "conversation", ["a", "b"]), staleTime: 0 });
    expect(requests).toEqual([
      ["a", "b"],
      ["a", "b"],
    ]);
  } finally {
    client.clear();
  }
});

test("no context request is sent when every ID is cached", async () => {
  const client = new QueryClient();
  const requests = fakeMessagePageServer();
  try {
    await client.query(messagePageOptions("org", "conversation", ["a", "b", "c"]));
    const after = await client.query(messagePageOptions("org", "conversation", ["c", "a"]));
    expect(requests).toEqual([["a", "b", "c"]]);
    expect(after.map((row) => row.messageId)).toEqual(["c", "a"]);
  } finally {
    client.clear();
  }
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
    // The second message's link was renamed before the third message arrived. The change
    // reaches the client as an invalidation hint.
    server = [row("one", "First"), row("two", "Renamed"), row("three", "Third")];
    await client.invalidateQueries({ queryKey: queryKeys.messagePages("org", "conversation") });
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
