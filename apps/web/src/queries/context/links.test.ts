import { QueryClient } from "@tanstack/react-query";

import { queryKeys } from "../keys";
import { messagePageOptions } from "./links";
import type { getMessagePage, MessagePageContext } from "@/api/context/links";
import { expect, test } from "bun:test";

const taskLink = (messageId: string, title: string): MessagePageContext["links"][number] => ({
  entityId: `task-${messageId}`,
  entityType: "task",
  title,
  projectEntityId: null,
  contactEntityId: null,
  status: null,
  purpose: "association",
  canRemove: true,
  statusName: null,
});

const pageRow = (messageId: string, title = messageId): MessagePageContext => ({
  messageId,
  messaging: [],
  links: [taskLink(messageId, title)],
  people: [],
  agents: [],
});

// Fakes the server and records the message IDs of each request.
const fakeMessagePageServer = (row = (id: string) => pageRow(id)) => {
  const requests: string[][] = [];
  const getPage: typeof getMessagePage = async ({ data }) => {
    requests.push(data.messageIds);
    return data.messageIds.map(row);
  };
  const page = (conversationId: string, messageIds: string[]) =>
    messagePageOptions("org", conversationId, messageIds, getPage);
  return { requests, page };
};

test("a new message's context page requests only the IDs no cached page covers", async () => {
  const client = new QueryClient();
  const { requests, page } = fakeMessagePageServer();
  try {
    await client.query(page("conversation", ["a", "b"]));
    const after = await client.query(page("conversation", ["a", "b", "c"]));
    expect(requests).toEqual([["a", "b"], ["c"]]);
    expect(after.map((row) => row.messageId)).toEqual(["a", "b", "c"]);
  } finally {
    client.clear();
  }
});

test("overlapping pages reuse the most recently refreshed message context", async () => {
  const client = new QueryClient();
  let title = "Original";
  const { requests, page } = fakeMessagePageServer((id) => pageRow(id, title));
  try {
    const first = page("conversation", ["a", "b"]);
    const second = page("conversation", ["a", "b", "c"]);
    await client.query(first);
    await client.query(second);
    title = "Renamed";
    const refreshed = await client.query({ ...first, staleTime: 0 });
    // Make the relative refresh times explicit, independent of the system clock's resolution.
    client.setQueryData(second.queryKey, client.getQueryData(second.queryKey), { updatedAt: 1 });
    client.setQueryData(first.queryKey, refreshed, { updatedAt: 2 });
    const after = await client.query(page("conversation", ["a", "b", "c", "d"]));
    expect(after[0]!.links[0]!.title).toBe("Renamed");
    expect(after[1]!.links[0]!.title).toBe("Renamed");
    expect(requests).toEqual([["a", "b"], ["c"], ["a", "b"], ["d"]]);
  } finally {
    client.clear();
  }
});

test("an invalidated context page is not reused", async () => {
  const client = new QueryClient();
  const { requests, page } = fakeMessagePageServer();
  try {
    await client.query(page("conversation", ["a", "b"]));
    await client.invalidateQueries({ queryKey: queryKeys.messagePages("org", "conversation") });
    const after = await client.query(page("conversation", ["a", "b", "c"]));
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
  const { requests, page } = fakeMessagePageServer();
  try {
    await client.query(page("conversation", ["a", "b"]));
    await client.query({ ...page("conversation", ["a", "b"]), staleTime: 0 });
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
  const { requests, page } = fakeMessagePageServer();
  try {
    await client.query(page("conversation", ["a", "b", "c"]));
    const after = await client.query(page("conversation", ["c", "a"]));
    expect(requests).toEqual([["a", "b", "c"]]);
    expect(after.map((row) => row.messageId)).toEqual(["c", "a"]);
  } finally {
    client.clear();
  }
});

test("a new message's context page keeps the row objects of unchanged messages", async () => {
  const client = new QueryClient();
  const row = pageRow;
  let server = [row("one", "First"), row("two", "Second")];
  const getPage: typeof getMessagePage = async () => server;
  const page = (conversationId: string, messageIds: string[]) =>
    messagePageOptions("org", conversationId, messageIds, getPage);
  try {
    const before = await client.query(page("conversation", ["one", "two"]));
    // The second message's link was renamed before the third message arrived. The change
    // reaches the client as an invalidation hint.
    server = [row("one", "First"), row("two", "Renamed"), row("three", "Third")];
    await client.invalidateQueries({ queryKey: queryKeys.messagePages("org", "conversation") });
    const after = await client.query(page("conversation", ["one", "two", "three"]));
    expect(after[0]).toBe(before[0]!);
    expect(after[1]).not.toBe(before[1]!);
    expect<unknown>(after).toEqual(server);
    // Another conversation never shares rows, even for equal content.
    const other = await client.query(page("other", ["one"]));
    expect(other[0]).not.toBe(after[0]!);
  } finally {
    client.clear();
  }
});
