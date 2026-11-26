import { MutationObserver, QueryClient, type QueryKey } from "@tanstack/react-query";

import { queryKeys } from "../keys";
import { queryTargetFilter, type QueryTarget } from "../targets";
import { agentWorkInvalidations } from "./invalidation";
import { localWorkMutationOptions, requestActionMutationOptions } from "./mutations";
import { bridgeChangeTargets } from "./sync";
import { ApiError } from "@/api/result";
import { describe, expect, test } from "bun:test";

const target = crypto.randomUUID();

/** Which of the cached keys the targets match, by TanStack prefix matching. */
function matched(cached: QueryKey[], targets: (QueryKey | QueryTarget)[]) {
  const client = new QueryClient();
  for (const key of cached) client.setQueryData(key, []);
  const hits = new Set(
    targets.flatMap((target) =>
      client
        .getQueryCache()
        .findAll(queryTargetFilter("queryKey" in target ? target : { queryKey: target }))
        .map((query) => JSON.stringify(query.queryKey)),
    ),
  );
  client.clear();
  return cached.filter((key) => hits.has(JSON.stringify(key)));
}

const cached = [
  queryKeys.agentWorkRequests("user", "org", "c1"),
  queryKeys.agentWorkConversation("user", "org", "c1"),
  queryKeys.agentWorkNeedsYou("user", "org"),
  queryKeys.messages("org", target),
  queryKeys.messages("org", "unrelated"),
  queryKeys.conversations("org"),
  queryKeys.project("org", "project"),
  queryKeys.agentWorkNeedsYou("user", "other-org"),
  queryKeys.agentWorkNeedsYou("other-user", "org"),
];

describe("agent-work mutation invalidation", () => {
  test("a conflict still refreshes the owner's requests, but not another owner's", async () => {
    const client = new QueryClient();
    const key = queryKeys.agentWorkRequests("user", "org", "conversation");
    const otherOwner = queryKeys.agentWorkRequests("other-user", "org", "conversation");
    for (const cachedKey of [key, otherOwner]) client.setQueryData(cachedKey, []);
    try {
      const action = new MutationObserver(
        client,
        requestActionMutationOptions(client, "user", "org", async () => {
          throw new ApiError("CONFLICT", "Already answered.", 409);
        }),
      );
      const result = await action
        .mutate({ requestId: "request", response: { type: "approval", optionId: "allow" } })
        .catch((error: Error) => error);
      expect(result).toMatchObject({ status: 409 });
      expect(client.getQueryState(key)?.isInvalidated).toBe(true);
      expect(client.getQueryState(otherOwner)?.isInvalidated).toBe(false);
    } finally {
      client.clear();
    }
  });

  test("a partial desktop failure refreshes local work, not server work or another workspace", async () => {
    const client = new QueryClient();
    const local = queryKeys.agentWorkRoutines("user", "org", "agent");
    const untouched = [
      queryKeys.agentWorkStatus("user", "org"),
      queryKeys.agentWorkRoutines("user", "other-org", "agent"),
    ];
    for (const key of [local, ...untouched]) client.setQueryData(key, []);
    try {
      const failure = new Error("Desktop response lost");
      const options = localWorkMutationOptions(client, "user", "org");
      const action = new MutationObserver(
        client,
        options(async (_id: string) => {
          throw failure;
        }),
      );
      expect(await action.mutate("routine").catch((error: Error) => error)).toBe(failure);
      expect(client.getQueryState(local)?.isInvalidated).toBe(true);
      for (const key of untouched) expect(client.getQueryState(key)?.isInvalidated).toBe(false);
    } finally {
      client.clear();
    }
  });

  test("an answer refreshes only this owner's agent work in this workspace", () => {
    expect(matched(cached, agentWorkInvalidations("user", "org", { kind: "agent-work" }))).toEqual(
      cached.slice(0, 3),
    );
  });

  test("a local action refreshes only local work, not the server status, needs-you, or requests", () => {
    const local = [
      queryKeys.agentWorkConversation("user", "org", "c1"),
      queryKeys.agentWorkTurnEvents("user", "org", "t1"),
      queryKeys.agentWorkAgents("user", "org"),
    ];
    const server = [
      queryKeys.agentWorkStatus("user", "org"),
      queryKeys.agentWorkNeedsYou("user", "org"),
      queryKeys.agentWorkRequests("user", "org", "c1"),
    ];
    const keys = agentWorkInvalidations("user", "org", { kind: "local" });
    expect(keys).toEqual([{ queryKey: queryKeys.agentWorkLocal("user", "org") }]);
    expect(matched([...local, ...server], keys)).toEqual(local);
  });
});

describe("bridge change hints", () => {
  test("a conversation hint refreshes that conversation's local work and the agent list", () => {
    const local = [
      queryKeys.agentWorkConversation("user", "org", "c1"),
      queryKeys.agentWorkConversation("user", "org", "c2"),
      queryKeys.agentWorkAgents("user", "org"),
      queryKeys.agentWorkRequests("user", "org", "c1"),
    ];
    expect(matched(local, bridgeChangeTargets("user", "org", { conversationId: "c1" }))).toEqual([
      local[0]!,
      local[2]!,
    ]);
  });

  test("a turn hint refreshes that turn's view and events, not other turns", () => {
    const local = [
      queryKeys.agentWorkTurn("user", "org", "t1"),
      queryKeys.agentWorkTurnEvents("user", "org", "t1"),
      queryKeys.agentWorkTurn("user", "org", "t2"),
    ];
    expect(matched(local, bridgeChangeTargets("user", "org", { turnId: "t1" }))).toEqual(
      local.slice(0, 2),
    );
  });

  test("a steering or output hint for a turn refreshes conversation work without a status change", () => {
    const local = [
      queryKeys.agentWorkConversation("user", "org", "c1"),
      queryKeys.agentWorkConversation("user", "org", "c2"),
      queryKeys.agentWorkTurnEvents("user", "org", "t1"),
      queryKeys.agentWorkStatus("user", "org"),
      queryKeys.agentWorkConversation("user", "other-org", "c1"),
    ];
    const change = { userAgentId: "a1", turnId: "t1" };
    expect(matched(local, bridgeChangeTargets("user", "org", change))).toEqual(local.slice(0, 3));
  });

  test("a turn hint that names its conversation refreshes only that conversation", () => {
    const local = [
      queryKeys.agentWorkConversation("user", "org", "c1"),
      queryKeys.agentWorkConversation("user", "org", "c2"),
    ];
    const change = { userAgentId: "a1", turnId: "t1", conversationId: "c1" };
    expect(matched(local, bridgeChangeTargets("user", "org", change))).toEqual([local[0]!]);
  });

  test("a hint without IDs refreshes all local work but not server reads", () => {
    const local = [
      queryKeys.agentWorkTurnEvents("user", "org", "t1"),
      queryKeys.agentWorkRoutines("user", "org", "a1"),
      queryKeys.agentWorkStatus("user", "org"),
    ];
    expect(matched(local, bridgeChangeTargets("user", "org", {}))).toEqual(local.slice(0, 2));
  });
});
