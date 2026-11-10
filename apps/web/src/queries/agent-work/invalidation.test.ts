import { QueryClient, type QueryKey } from "@tanstack/react-query";

import { queryKeys } from "../keys";
import { agentWorkInvalidations } from "./invalidation";
import { bridgeChangeTargets } from "./sync";
import { describe, expect, test } from "bun:test";

const target = crypto.randomUUID();

/** Which of the cached keys the targets match, by TanStack prefix matching. */
function matched(cached: QueryKey[], targets: QueryKey[]) {
  const client = new QueryClient();
  for (const key of cached) client.setQueryData(key, []);
  const hits = new Set(
    targets.flatMap((queryKey) =>
      client
        .getQueryCache()
        .findAll({ queryKey })
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
    expect(keys).toEqual([queryKeys.agentWorkLocal("user", "org")]);
    expect(matched([...local, ...server], keys)).toEqual(local);
  });

  test("an approved reply also refreshes the target conversation's messages", () => {
    const keys = agentWorkInvalidations("user", "org", {
      kind: "approved",
      action: { type: "reply_elsewhere", input: { conversationId: target, body: "Hi" } },
    });
    expect(matched(cached, keys)).toEqual([...cached.slice(0, 4), queryKeys.conversations("org")]);
  });

  test("an approved task proposal also refreshes tasks, not messages", () => {
    const keys = agentWorkInvalidations("user", "org", {
      kind: "approved",
      action: { type: "create_task", input: { projectId: target, title: "Follow up" } },
    });
    expect(matched(cached, keys)).toEqual([
      ...cached.slice(0, 3),
      queryKeys.project("org", "project"),
    ]);
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
