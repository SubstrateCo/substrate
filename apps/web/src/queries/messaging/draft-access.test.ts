import { QueryClient } from "@tanstack/react-query";

import { subscribeDraftAccess } from "./draft-access";
import { queryKeys } from "@/queries/keys";
import { expect, test } from "bun:test";

const organizationId = "org";
const draftKey = (conversationId: string) => `${organizationId}:${conversationId}:channel`;

/** Subscribes and records, for each revoke, which of `conversationIds` keep their drafts. */
function watch(client: QueryClient, conversationIds: string[]) {
  const calls: string[][] = [];
  subscribeDraftAccess(client, organizationId, (accessible) => {
    calls.push(conversationIds.filter((id) => accessible(draftKey(id))));
  });
  return { calls };
}

async function fail(client: QueryClient, queryKey: readonly unknown[], error: Error) {
  await client
    // oxlint-disable-next-line @tanstack/query/exhaustive-deps -- The test fails a fixed key on purpose; the error is the outcome, not an input.
    .query({ queryKey, queryFn: () => Promise.reject(error), retry: false })
    .catch(() => {});
}

test("a list read revokes drafts for conversations it no longer has and keeps known discussions", () => {
  const client = new QueryClient();
  client.setQueryData(queryKeys.conversationList(organizationId, "discussion"), [
    { id: "discussion", task: { title: "Launch" } },
  ]);
  const { calls } = watch(client, ["channel", "left", "discussion"]);
  client.setQueryData(queryKeys.conversationList(organizationId), [{ id: "channel" }]);
  expect(calls).toEqual([["channel", "discussion"]]);
});

test("a selected read revokes only the selected conversation's draft", () => {
  const client = new QueryClient();
  const { calls } = watch(client, ["first", "second"]);
  client.setQueryData(queryKeys.conversationList(organizationId, "first"), []);
  expect(calls).toEqual([["second"]]);
});

test("network failures revoke nothing, and losing the organization revokes every draft", async () => {
  const client = new QueryClient();
  const { calls } = watch(client, ["channel"]);
  await fail(client, queryKeys.conversationList(organizationId), new Error("Offline"));
  await fail(client, queryKeys.organizationSummary(organizationId), new Error("Offline"));
  expect(calls).toEqual([]);
  await fail(
    client,
    queryKeys.organizationSummary(organizationId),
    Object.assign(new Error("Forbidden"), { status: 403 }),
  );
  expect(calls).toEqual([[]]);
});

test("reads of another organization or of other conversation keys revoke nothing", () => {
  const client = new QueryClient();
  const { calls } = watch(client, ["channel"]);
  client.setQueryData(queryKeys.conversationList("other"), []);
  client.setQueryData(queryKeys.managedConversations(organizationId), []);
  expect(calls).toEqual([]);
});
