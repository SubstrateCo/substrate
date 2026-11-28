import { MutationObserver, QueryClient, QueryObserver, type QueryKey } from "@tanstack/react-query";

import { queryKeys } from "../keys";
import { queryTargetFilter, type QueryTarget } from "../targets";
import { agentWorkInvalidations } from "./invalidation";
import { requestActionMutationOptions, workMutationOptions } from "./mutations";
import { bridgeChangeTargets } from "./sync";
import { ApiError } from "@/api/result";
import { describe, expect, test } from "bun:test";

type Requests = NonNullable<Parameters<typeof requestActionMutationOptions>[3]>;

/** Server requests that all settle with `settle`. */
const requests = (settle: () => Promise<void>): Requests => ({
  respondToRequest: settle,
  approveProposal: settle,
  declineProposal: settle,
});

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
  queryKeys.agentWorkTurn("user", "org", "t1"),
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
  test("an approved task reads overlapping context targets once without canceling them", async () => {
    const client = new QueryClient();
    const keys = [
      queryKeys.activity("org", "task"),
      queryKeys.related("org", "task"),
      queryKeys.messagePage("org", "conversation", ["message"]),
    ];
    const reads = keys.map(() => 0);
    let canceled = 0;
    const response = Promise.withResolvers<{ links: unknown[] }[]>();
    const stops = keys.map((queryKey, index) =>
      new QueryObserver(client, {
        queryKey,
        initialData: [{ links: ["task"] }],
        staleTime: Infinity,
        queryFn: ({ signal }) => {
          reads[index]++;
          signal.addEventListener("abort", () => canceled++);
          return response.promise;
        },
      }).subscribe(() => {}),
    );
    try {
      const pending = new MutationObserver(
        client,
        requestActionMutationOptions(
          client,
          "user",
          "org",
          requests(async () => {}),
        ),
      ).mutate({
        kind: "approve",
        requestId: "request",
        action: { tool: "create_task", input: { projectId: target, title: "Follow up" } },
      });
      response.resolve([{ links: [] }]);
      await pending;
      expect(reads).toEqual([1, 1, 1]);
      expect(canceled).toBe(0);
      for (const key of keys) expect(client.getQueryData(key)).toEqual([{ links: [] }]);
    } finally {
      response.resolve([]);
      stops.forEach((stop) => stop());
      client.clear();
    }
  });

  test("a conflict still refreshes the owner's requests, but not another owner's", async () => {
    const client = new QueryClient();
    const key = queryKeys.agentWorkConversation("user", "org", "conversation");
    const otherOwner = queryKeys.agentWorkConversation("other-user", "org", "conversation");
    for (const cachedKey of [key, otherOwner]) client.setQueryData(cachedKey, []);
    try {
      const action = new MutationObserver(
        client,
        requestActionMutationOptions(
          client,
          "user",
          "org",
          requests(async () => {
            throw new ApiError("CONFLICT", "Already answered.", 409);
          }),
        ),
      );
      const result = await action
        .mutate({ kind: "decline", requestId: "request" })
        .catch((error: Error) => error);
      expect(result).toMatchObject({ status: 409 });
      expect(client.getQueryState(key)?.isInvalidated).toBe(true);
      expect(client.getQueryState(otherOwner)?.isInvalidated).toBe(false);
    } finally {
      client.clear();
    }
  });

  test("a failed work command still refreshes the owner's server work in this workspace", async () => {
    const client = new QueryClient();
    const server = [
      queryKeys.agentWorkRoutines("user", "org", "agent"),
      queryKeys.agentWorkActivity("user", "org", "agent"),
    ];
    const untouched = [
      queryKeys.agentWorkTurnEvents("user", "org", "turn"),
      queryKeys.agentWorkRoutines("user", "other-org", "agent"),
    ];
    for (const key of [...server, ...untouched]) client.setQueryData(key, []);
    try {
      const conflict = new ApiError("CONFLICT", "The routine changed.", 409);
      const options = workMutationOptions(client, "user", "org");
      const action = new MutationObserver(
        client,
        options(async (_id: string) => {
          throw conflict;
        }),
      );
      expect(await action.mutate("routine").catch((error: Error) => error)).toBe(conflict);
      for (const key of server) expect(client.getQueryState(key)?.isInvalidated).toBe(true);
      for (const key of untouched) expect(client.getQueryState(key)?.isInvalidated).toBe(false);
    } finally {
      client.clear();
    }
  });

  test("an answer or command refreshes only this owner's server work in this workspace", () => {
    expect(matched(cached, agentWorkInvalidations("user", "org", { kind: "agent-work" }))).toEqual(
      cached.slice(0, 3),
    );
  });

  test("server work refreshes leave local transcripts and homed agents alone", () => {
    const local = [
      queryKeys.agentWorkTurnEvents("user", "org", "t1"),
      queryKeys.agentWorkTurnRuns("user", "org", "t1"),
      queryKeys.agentWorkHomed("user", "org"),
    ];
    const server = [
      queryKeys.agentWorkStatus("user", "org"),
      queryKeys.agentWorkTurn("user", "org", "t1"),
      queryKeys.agentWorkConversation("user", "org", "c1"),
    ];
    const keys = agentWorkInvalidations("user", "org", { kind: "agent-work" });
    expect(matched([...local, ...server], keys)).toEqual(server);
  });

  test("an approval refreshes the reactions, notifications, and searches its record shows in", () => {
    const shown = [
      queryKeys.messageReactions("org", target, "m1"),
      queryKeys.notifications("org"),
      [...queryKeys.search("org"), { query: "follow" }],
      [...queryKeys.searchPages("org"), { query: "follow" }],
    ];
    const reply = agentWorkInvalidations("user", "org", {
      kind: "approved",
      action: { tool: "reply", input: { body: "Hi", to: { conversationId: target } } },
    });
    const task = agentWorkInvalidations("user", "org", {
      kind: "approved",
      action: { tool: "create_task", input: { projectId: target, title: "Follow up" } },
    });
    const unknown = agentWorkInvalidations("user", "org", { kind: "approved", action: null });
    expect(matched(shown, reply)).toEqual([shown[0]!, shown[2]!, shown[3]!]);
    expect(matched(shown, task)).toEqual(shown.slice(1));
    expect(matched(shown, unknown)).toEqual(shown);
  });

  test("an approved reply also refreshes the target conversation's messages", () => {
    const keys = agentWorkInvalidations("user", "org", {
      kind: "approved",
      action: { tool: "reply", input: { body: "Hi", to: { conversationId: target } } },
    });
    expect(matched(cached, keys)).toEqual([...cached.slice(0, 4), queryKeys.conversations("org")]);
  });

  test("an approved task proposal also refreshes tasks, not messages", () => {
    const keys = agentWorkInvalidations("user", "org", {
      kind: "approved",
      action: { tool: "create_task", input: { projectId: target, title: "Follow up" } },
    });
    expect(matched(cached, keys)).toEqual([
      ...cached.slice(0, 3),
      queryKeys.project("org", "project"),
    ]);
  });

  test("an approved CRM call refreshes CRM records and contacts, not messages", () => {
    const crm = [queryKeys.crmRecord("org", "deals", target), queryKeys.contacts("org")];
    const keys = agentWorkInvalidations("user", "org", {
      kind: "approved",
      action: {
        tool: "archive_crm_record",
        input: { kind: "deal", entityId: target, archived: true },
      },
    });
    expect(matched([...crm, queryKeys.messages("org", target)], keys)).toEqual(crm);
  });
});

describe("bridge change hints", () => {
  test("a turn hint refreshes that turn's events and runs and the homed agents, not other turns", () => {
    const local = [
      queryKeys.agentWorkTurnEvents("user", "org", "t1"),
      queryKeys.agentWorkTurnRuns("user", "org", "t1"),
      queryKeys.agentWorkHomed("user", "org"),
      queryKeys.agentWorkTurnEvents("user", "org", "t2"),
      queryKeys.agentWorkTurnEvents("user", "other-org", "t1"),
    ];
    const change = { userAgentId: "a1", turnId: "t1" };
    expect(matched(local, bridgeChangeTargets("user", "org", change))).toEqual(local.slice(0, 3));
  });

  test("a bridge hint never refreshes server work", () => {
    const server = [
      queryKeys.agentWorkStatus("user", "org"),
      queryKeys.agentWorkTurn("user", "org", "t1"),
      queryKeys.agentWorkConversation("user", "org", "c1"),
      queryKeys.agentWorkActivity("user", "org", "a1"),
    ];
    for (const change of [{}, { userAgentId: "a1", turnId: "t1" }])
      expect(matched(server, bridgeChangeTargets("user", "org", change))).toEqual([]);
  });

  test("a hint without IDs refreshes every local read of this workspace", () => {
    const local = [
      queryKeys.agentWorkTurnEvents("user", "org", "t1"),
      queryKeys.agentWorkHomed("user", "org"),
      queryKeys.agentWorkHomed("user", "other-org"),
    ];
    expect(matched(local, bridgeChangeTargets("user", "org", {}))).toEqual(local.slice(0, 2));
  });
});
