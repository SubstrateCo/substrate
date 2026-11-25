import type { RealtimeEvent } from "@substrate/contracts/realtime";
import { advanceTimersAsync } from "@substrate/contracts/testing/timers";

import { QueryClient, QueryObserver, type QueryKey } from "@tanstack/react-query";

import { queryKeys } from "../keys";
import { queryTargetFilter } from "../targets";
import { createRealtimeCache, realtimeQueryTargets } from "./cache";
import { afterEach, beforeEach, expect, vi, test } from "bun:test";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function change(
  domain: Extract<RealtimeEvent, { type: "change" }>["domain"],
  organizationId: string | null = "org",
) {
  return { version: 1, type: "change", id: crypto.randomUUID(), organizationId, domain } as const;
}

test("a reply hint refreshes only the viewer's calls in its conversation", () => {
  const targets = realtimeQueryTargets(
    { ...change("messaging"), conversationId: "conversation", scope: "messages" },
    "user",
  );
  const client = new QueryClient();
  const own = queryKeys.myAgentCalls("user", "org", "conversation");
  const unrelated = [
    queryKeys.myAgentCalls("other", "org", "conversation"),
    queryKeys.myAgentCalls("user", "other-org", "conversation"),
    queryKeys.myAgentCalls("user", "org", "other-conversation"),
    queryKeys.agentWorkNeedsYou("user", "org"),
    queryKeys.agentCallsLog("user", "org", "agent"),
  ];
  for (const key of [own, ...unrelated]) client.setQueryData(key, []);
  const matched = targets.flatMap((target) => client.getQueryCache().findAll(target));
  expect(matched.map((query) => query.queryKey)).toContainEqual(own);
  for (const key of unrelated)
    expect(matched.map((query) => query.queryKey)).not.toContainEqual(key);
  client.clear();
});

test("a task hint during an in-flight read stays stale when its panel becomes hidden", async () => {
  const client = new QueryClient();
  const key = queryKeys.taskAttachments("org", "project", "task");
  const first = Promise.withResolvers<string[]>();
  let reads = 0;
  const read = async () => (++reads === 1 ? first.promise : ["fresh"]);
  const options = {
    queryKey: key,
    staleTime: Infinity,
    queryFn: () => read(),
  };
  const observer = new QueryObserver(client, options);
  const unsubscribe = observer.subscribe(() => {});
  const cache = createRealtimeCache({
    queryClient: client,
    organizationId: "org",
    userId: "user",
    revalidate: async () => {},
    batchMs: 5,
  });
  try {
    await cache.receive(change("tasks"));
    await advanceTimersAsync(25);
    observer.setOptions({ ...options, enabled: false });
    first.resolve(["old snapshot"]);
    await advanceTimersAsync(25);
    expect(reads).toBe(1);
    expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    observer.setOptions({ ...options, enabled: true });
    await advanceTimersAsync(0);
    expect(client.getQueryData(key)).toEqual(["fresh"]);
    expect(reads).toBe(2);
  } finally {
    first.resolve([]);
    cache.dispose();
    unsubscribe();
    client.clear();
  }
});

for (const domain of ["context", "profile"] as const) {
  for (const overlap of ["none", "before", "after"] as const) {
    test(`in-flight search respects stale-only policy across overlapping task/${domain} events (${overlap})`, async () => {
      const client = new QueryClient();
      const key = [...queryKeys.context("org"), "search", "task"];
      const first = Promise.withResolvers<string[]>();
      let reads = 0;
      const read = async () => (++reads === 1 ? first.promise : ["fresh"]);
      const observer = new QueryObserver(client, {
        queryKey: key,
        staleTime: Infinity,
        queryFn: () => read(),
      });
      const unsubscribe = observer.subscribe(() => {});
      const cache = createRealtimeCache({
        queryClient: client,
        organizationId: "org",
        userId: "user",
        revalidate: async () => {},
        batchMs: 5,
      });
      try {
        if (overlap === "before") await cache.receive(change(domain));
        await cache.receive(change("tasks"));
        if (overlap === "after") await cache.receive(change(domain));
        await advanceTimersAsync(25);
        first.resolve(["old snapshot"]);
        await advanceTimersAsync(25);
        const refresh = domain === "profile" && overlap !== "none";
        expect(reads).toBe(refresh ? 2 : 1);
        expect(client.getQueryState(key)?.isInvalidated).toBe(!refresh);
        expect(client.getQueryData(key)).toEqual(refresh ? ["fresh"] : ["old snapshot"]);
      } finally {
        first.resolve([]);
        cache.dispose();
        unsubscribe();
        client.clear();
      }
    });
  }
}

test("access resets clear hidden task data without issuing hidden reads", async () => {
  const client = new QueryClient();
  const key = queryKeys.taskAttachments("org", "project", "task");
  let reads = 0;
  const read = async () => {
    reads++;
    return ["private"];
  };
  const observer = new QueryObserver(client, {
    queryKey: key,
    enabled: false,
    queryFn: () => read(),
  });
  const unsubscribe = observer.subscribe(() => {});
  client.setQueryData(key, ["private"]);
  const cache = createRealtimeCache({
    queryClient: client,
    organizationId: "org",
    userId: "user",
    revalidate: async () => {},
  });
  try {
    const reset = cache.receive(change("access"));
    expect(client.getQueryData(key)).toBeUndefined();
    expect(observer.getCurrentResult().data).toBeUndefined();
    await reset;
    expect(reads).toBe(0);
  } finally {
    cache.dispose();
    unsubscribe();
    client.clear();
  }
});

test("workspace profile changes refresh actor names across domains and the session", () => {
  expect(realtimeQueryTargets(change("profile"), "user")).toEqual([
    { queryKey: queryKeys.session },
    { queryKey: queryKeys.messaging("org") },
    { queryKey: queryKeys.context("org") },
    { queryKey: queryKeys.tasks("org") },
  ]);
  expect(realtimeQueryTargets(change("profile", null), "user")).toEqual([
    { queryKey: queryKeys.session },
  ]);
});

test("organization invitations refresh user lists without an active workspace", () => {
  expect(realtimeQueryTargets(change("organization", null), "user")).toEqual([
    { queryKey: queryKeys.organizations },
    { queryKey: queryKeys.userInvitations },
  ]);
});

test("organization hints retain role refresh because organization deletion has no access hint", () => {
  // The detail target also refreshes the summary that holds the role (see "workspace detail
  // changes refresh organization details").
  expect(realtimeQueryTargets(change("organization"), "user")).toEqual([
    { queryKey: queryKeys.organizations },
    { queryKey: queryKeys.userInvitations },
    { queryKey: queryKeys.organizationDetail("org") },
    { queryKey: queryKeys.organizationApps("org") },
    { queryKey: queryKeys.invitations("org") },
  ]);
});

test("access hints reload the viewer's role in the organization summary", async () => {
  const client = new QueryClient();
  const key = queryKeys.organizationSummary("org");
  client.setQueryData(key, { role: "owner" });
  const observer = new QueryObserver(client, {
    queryKey: key,
    staleTime: Infinity,
    queryFn: async () => ({ role: "member" }),
  });
  const unsubscribe = observer.subscribe(() => {});
  const cache = createRealtimeCache({
    queryClient: client,
    organizationId: "org",
    userId: "user",
    revalidate: async () => {},
  });
  try {
    await cache.receive(change("access"));
    expect(client.getQueryData(key)).toEqual({ role: "member" });
    expect(observer.getCurrentResult().data).toEqual({ role: "member" });
  } finally {
    cache.dispose();
    unsubscribe();
    client.clear();
  }
});

test("messaging targets all thread variants of one conversation, not another", () => {
  const targets = realtimeQueryTargets(
    { ...change("messaging"), conversationId: "conversation" },
    "user",
  );
  expect(targets).toEqual([
    { queryKey: queryKeys.myAgentCalls("user", "org", "conversation") },
    { queryKey: queryKeys.messageUnread("org") },
    { queryKey: queryKeys.conversations("org") },
    { queryKey: queryKeys.conversationMessages("org", "conversation") },
    { queryKey: queryKeys.conversationReactions("org", "conversation") },
    { queryKey: queryKeys.related("org") },
    { queryKey: queryKeys.messagePages("org", "conversation") },
    { queryKey: queryKeys.messageTargets("org", "conversation") },
    { queryKey: queryKeys.search("org") },
    { queryKey: queryKeys.searchPages("org") },
  ]);
  expect(realtimeQueryTargets(change("notifications"), "user")).toEqual([
    { queryKey: queryKeys.notifications("org") },
  ]);
  expect(realtimeQueryTargets(change("agents", null), "user")).toEqual([
    { queryKey: queryKeys.agents("user") },
  ]);
});

test("a read-position hint refreshes only unread counts", () => {
  const client = new QueryClient();
  const unread = queryKeys.messageUnread("org");
  const untouched = [
    queryKeys.conversations("org"),
    queryKeys.messages("org", "conversation"),
    queryKeys.messageReactions("org", "conversation", "message"),
    queryKeys.messagePage("org", "conversation", ["message"]),
    queryKeys.messageTargets("org", "conversation"),
    queryKeys.related("org", "task"),
    queryKeys.search("org"),
    queryKeys.myAgentCalls("user", "org", "conversation"),
    queryKeys.messageUnread("other-org"),
  ];
  for (const key of [unread, ...untouched]) client.setQueryData(key, []);
  const matched = realtimeQueryTargets({ ...change("messaging"), scope: "read" }, "user").flatMap(
    (target) =>
      client
        .getQueryCache()
        .findAll(queryTargetFilter(target))
        .map((query) => query.queryKey),
  );
  expect(matched).toEqual([unread]);
  client.clear();
});

function matchedKeys(event: Extract<RealtimeEvent, { type: "change" }>, keys: QueryKey[]) {
  const client = new QueryClient();
  for (const key of keys) client.setQueryData(key, []);
  const matched = new Set(
    realtimeQueryTargets(event, "user").flatMap((target) =>
      client
        .getQueryCache()
        .findAll(queryTargetFilter(target))
        .map((query) => JSON.stringify(query.queryKey)),
    ),
  );
  client.clear();
  return keys.filter((key) => matched.has(JSON.stringify(key)));
}

test("a reaction hint refreshes that message's thread and reactions only", () => {
  const event = {
    ...change("messaging"),
    conversationId: "conversation",
    scope: "reactions",
    messageId: "reply",
    threadId: "root",
  } as const;
  const refreshed = [
    [...queryKeys.messages("org", "conversation", "root"), { before: "older" }],
    queryKeys.messageReactions("org", "conversation", "reply"),
    [...queryKeys.messageTargets("org", "conversation"), "reply"],
  ];
  const untouched = [
    queryKeys.messages("org", "conversation"),
    queryKeys.messages("org", "conversation", "other-thread"),
    queryKeys.messageReactions("org", "conversation", "other-message"),
    queryKeys.messages("org", "other"),
    queryKeys.messageUnread("org"),
    queryKeys.conversations("org"),
    queryKeys.messagePage("org", "conversation", ["reply"]),
    queryKeys.related("org", "task"),
    queryKeys.search("org"),
    queryKeys.myAgentCalls("user", "org", "conversation"),
  ];
  expect(matchedKeys(event, [...refreshed, ...untouched])).toEqual(refreshed);
  // A reaction on a main-timeline message refreshes the timeline, not its threads.
  expect(
    matchedKeys({ ...event, messageId: "root", threadId: null }, [
      queryKeys.messages("org", "conversation"),
      queryKeys.messages("org", "conversation", "root"),
    ]),
  ).toEqual([queryKeys.messages("org", "conversation")]);
});

test("new messages refresh history, not conversation lists or loaded message context", () => {
  const targets = realtimeQueryTargets(
    { ...change("messaging"), conversationId: "conversation", scope: "messages" },
    "user",
  );
  expect(targets).not.toContainEqual({ queryKey: queryKeys.conversations("org") });
  expect(targets).not.toContainEqual({ queryKey: queryKeys.messagePages("org", "conversation") });
  // New posts only make open searches stale.
  for (const queryKey of queryKeys.searches("org"))
    expect(targets).toContainEqual({ queryKey, refetchType: "none" });
});

test("a new reply refreshes its thread and the timeline's reply count, nothing else in history", () => {
  const event = {
    ...change("messaging"),
    conversationId: "conversation",
    scope: "messages",
    messageId: "reply",
    threadId: "root",
  } as const;
  const refreshed = [
    queryKeys.messageUnread("org"),
    queryKeys.messages("org", "conversation"),
    queryKeys.messages("org", "conversation", "root"),
    [...queryKeys.messageTargets("org", "conversation"), "root"],
    queryKeys.myAgentCalls("user", "org", "conversation"),
  ];
  const untouched = [
    queryKeys.messages("org", "conversation", "other-thread"),
    queryKeys.messages("org", "other"),
    queryKeys.messageReactions("org", "conversation", "root"),
    queryKeys.conversations("org"),
    queryKeys.messagePage("org", "conversation", ["root"]),
    queryKeys.messagePage("org", "other", ["message"]),
  ];
  expect(matchedKeys(event, [...refreshed, ...untouched])).toEqual(refreshed);
  // A new main-timeline message leaves every thread alone.
  expect(
    matchedKeys({ ...event, messageId: "new", threadId: null }, [
      queryKeys.messages("org", "conversation"),
      queryKeys.messages("org", "conversation", "root"),
    ]),
  ).toEqual([queryKeys.messages("org", "conversation")]);
});

test("message changes refresh only related lists that show their conversation", () => {
  const client = new QueryClient();
  const shows = queryKeys.related("org", "shows");
  const other = queryKeys.related("org", "other");
  const loading = queryKeys.related("org", "loading");
  client.setQueryData(shows, [{ conversationId: "conversation" }]);
  client.setQueryData(other, [{ conversationId: "elsewhere" }]);
  client.getQueryCache().build(client, { queryKey: loading });
  const matched = (event: Extract<RealtimeEvent, { type: "change" }>) =>
    realtimeQueryTargets(event, "user").flatMap((target) =>
      client
        .getQueryCache()
        .findAll(queryTargetFilter(target))
        .filter((query) => query.queryKey[3] === "related")
        .map((query) => query.queryKey),
    );
  const sent = {
    ...change("messaging"),
    conversationId: "conversation",
    scope: "messages",
  } as const;
  expect(matched(sent)).toEqual([shows, loading]);
  expect(
    matched({ ...change("messaging"), conversationId: "conversation", messageId: "m" }),
  ).toEqual([shows, loading]);
  // Membership changes can reveal messages that a list does not show yet.
  expect(matched({ ...change("messaging"), conversationId: "conversation" })).toEqual([
    shows,
    other,
    loading,
  ]);
  client.clear();
});

test("an edited or deleted message refreshes its own thread, reactions, and context pages", () => {
  const event = {
    ...change("messaging"),
    conversationId: "conversation",
    messageId: "root",
    threadId: null,
  } as const;
  const refreshed = [
    queryKeys.messageUnread("org"),
    queryKeys.conversations("org"),
    queryKeys.messages("org", "conversation"),
    queryKeys.messages("org", "conversation", "root"),
    queryKeys.messageReactions("org", "conversation", "root"),
    queryKeys.messagePage("org", "conversation", ["older", "root"]),
    [...queryKeys.search("org"), "term"],
  ];
  const untouched = [
    queryKeys.messages("org", "conversation", "other-thread"),
    queryKeys.messageReactions("org", "conversation", "other"),
    queryKeys.messagePage("org", "conversation", ["other"]),
    queryKeys.messages("org", "other"),
  ];
  expect(matchedKeys(event, [...refreshed, ...untouched])).toEqual(refreshed);
});

test("a new-message hint reads history once and loaded message context not at all", async () => {
  const client = new QueryClient();
  const reads = { messages: 0, pages: 0, reactions: 0 };
  const observe = (queryKey: readonly unknown[], kind: keyof typeof reads) => {
    const read = async () => {
      reads[kind]++;
      return [];
    };
    return new QueryObserver(client, {
      queryKey,
      staleTime: Infinity,
      queryFn: () => read(),
    }).subscribe(() => {});
  };
  const unsubscribe = [
    observe(queryKeys.messages("org", "conversation"), "messages"),
    observe(queryKeys.messageReactions("org", "conversation", "message"), "reactions"),
    observe([...queryKeys.context("org"), "message-pages", "conversation", ["m1", "m2"]], "pages"),
  ];
  const cache = createRealtimeCache({
    queryClient: client,
    organizationId: "org",
    userId: "user",
    revalidate: async () => {},
    batchMs: 5,
  });
  try {
    await advanceTimersAsync(0);
    await cache.receive({
      ...change("messaging"),
      conversationId: "conversation",
      scope: "messages",
    });
    await advanceTimersAsync(25);
    // A new message has no reactions yet.
    expect(reads).toEqual({ messages: 2, pages: 1, reactions: 1 });
    await cache.receive({ ...change("messaging"), conversationId: "conversation" });
    await advanceTimersAsync(25);
    expect(reads).toEqual({ messages: 3, pages: 2, reactions: 2 });
  } finally {
    cache.dispose();
    for (const stop of unsubscribe) stop();
    client.clear();
  }
});

test("a task hint refreshes that task's records and its project's detail, nothing else", () => {
  const client = new QueryClient();
  const linked = queryKeys.messagePage("org", "conversation", ["linked"]);
  const unlinked = queryKeys.messagePage("org", "conversation", ["unlinked"]);
  client.setQueryData(linked, [{ links: [{ entityId: "task", projectEntityId: "project" }] }]);
  client.setQueryData(unlinked, [{ links: [{ entityId: "other", projectEntityId: "elsewhere" }] }]);
  const event = { ...change("tasks"), projectId: "project", taskIds: ["task"] };
  client.setQueryData(queryKeys.conversationList("org", "discussion"), [
    { task: { taskEntityId: "task", projectEntityId: "project" } },
  ]);
  const refreshed = [
    queryKeys.project("org", "project"),
    queryKeys.taskLocation("org", "task"),
    queryKeys.taskAttachments("org", "project", "task"),
    queryKeys.activity("org", "task"),
    queryKeys.conversationList("org", "discussion"),
    queryKeys.notificationGroups("org", "all"),
    queryKeys.notificationEvents("org", "group"),
    linked,
  ];
  const untouched = [
    queryKeys.projects("org"),
    queryKeys.project("org", "other-project"),
    queryKeys.taskLocation("org", "other"),
    queryKeys.taskAttachments("org", "project", "other"),
    queryKeys.activity("org", "other"),
    queryKeys.related("org", "task"),
    queryKeys.related("org", "project"),
    queryKeys.notificationUnread("org"),
    queryKeys.organizationSummary("org"),
    queryKeys.organizationPeople("org"),
    queryKeys.agentWorkStatus("user", "org"),
    queryKeys.agents("user"),
    unlinked,
  ];
  for (const key of [...refreshed, ...untouched])
    if (!client.getQueryData(key)) client.setQueryData(key, []);
  const matched = new Set(
    realtimeQueryTargets(event, "user").flatMap((target) =>
      client
        .getQueryCache()
        .findAll(queryTargetFilter(target))
        .map((query) => JSON.stringify(query.queryKey)),
    ),
  );
  expect([...refreshed, ...untouched].filter((key) => matched.has(JSON.stringify(key)))).toEqual(
    refreshed,
  );
  client.clear();
});

test("a project hint refreshes the project's records and lists, not other projects", () => {
  const event = { ...change("tasks"), projectId: "launch" } as const;
  const refreshed = [
    queryKeys.projects("org"),
    queryKeys.project("org", "launch"),
    queryKeys.taskAttachments("org", "launch", "task"),
    queryKeys.taskLocation("org", "task"),
    queryKeys.related("org", "launch"),
    queryKeys.notificationUnread("org"),
  ];
  const untouched = [
    queryKeys.project("org", "roadmap"),
    queryKeys.taskAttachments("org", "roadmap", "task"),
    queryKeys.related("org", "roadmap"),
    queryKeys.organizationSummary("org"),
    queryKeys.agentWorkStatus("user", "org"),
  ];
  expect(matchedKeys(event, [...refreshed, ...untouched])).toEqual(refreshed);
  // Without a project, as after a grant change, every task record can change.
  expect(matchedKeys(change("tasks"), untouched.slice(0, 3))).toEqual(untouched.slice(0, 3));
});

test("task metadata hints refresh discussion titles and backlinks, not ordinary conversation lists", () => {
  const client = new QueryClient();
  const key = queryKeys.conversationList("org", "discussion");
  const matches = (projectId: string, taskIds?: string[]) =>
    realtimeQueryTargets({ ...change("tasks"), projectId, taskIds }, "user").some(
      (target) => client.getQueryCache().findAll(queryTargetFilter(target)).length > 0,
    );
  try {
    client.setQueryData(queryKeys.deleteImpact("org", "ordinary"), { messages: 5 });
    client.setQueryData(queryKeys.conversations("org"), [{ task: null }]);
    client.setQueryData(key, [{ task: null }]);
    expect(matches("project", ["task"])).toBe(false);
    client.setQueryData(key, [{ task: { taskEntityId: "task", projectEntityId: "project" } }]);
    expect(matches("project", ["task"])).toBe(true);
    expect(matches("project", ["other"])).toBe(false);
    // A move hint may name the new project while the cache still has the previous backlink.
    expect(matches("destination", ["task"])).toBe(true);
    expect(matches("project")).toBe(true);
    expect(matches("other-project")).toBe(false);
  } finally {
    client.clear();
  }
});

test("selected discussion caches stay separate and a task hint refreshes only its selection", () => {
  const client = new QueryClient();
  const first = queryKeys.conversationList("org", "first");
  const second = queryKeys.conversationList("org", "second");
  const normal = queryKeys.conversationList("org");
  try {
    client.setQueryData(first, [
      { task: { taskEntityId: "first-task", projectEntityId: "project" } },
    ]);
    client.setQueryData(second, [
      { task: { taskEntityId: "second-task", projectEntityId: "project" } },
    ]);
    client.setQueryData(normal, [{ task: null }]);
    const matched = realtimeQueryTargets(
      { ...change("tasks"), projectId: "project", taskIds: ["first-task"] },
      "user",
    )
      .flatMap((target) => client.getQueryCache().findAll(queryTargetFilter(target)))
      .map((query) => query.queryKey);
    expect(matched).toEqual([first]);
    expect(client.getQueryData(first)).toEqual([
      { task: { taskEntityId: "first-task", projectEntityId: "project" } },
    ]);
    expect(client.getQueryData(second)).toEqual([
      { task: { taskEntityId: "second-task", projectEntityId: "project" } },
    ]);
  } finally {
    client.clear();
  }
});

test("a message reference hint refreshes only that message's context pages", () => {
  const event = {
    ...change("context"),
    conversationId: "conversation",
    messageId: "message",
  } as const;
  const refreshed = [
    queryKeys.messagePage("org", "conversation", ["older", "message"]),
    [...queryKeys.messageTargets("org", "conversation"), "message"],
  ];
  const untouched = [
    queryKeys.messagePage("org", "conversation", ["other"]),
    queryKeys.messagePage("org", "other", ["message"]),
    queryKeys.related("org", "task"),
    queryKeys.activity("org", "task"),
    queryKeys.messages("org", "conversation"),
  ];
  expect(matchedKeys(event, [...refreshed, ...untouched])).toEqual(refreshed);
});

test("a referenced-work hint refreshes the related lists of that project and its tasks", () => {
  const event = { ...change("context"), projectId: "launch", taskIds: ["task"] };
  const refreshed = [
    queryKeys.related("org", "launch"),
    queryKeys.related("org", "task"),
    queryKeys.activity("org", "task"),
  ];
  const untouched = [
    queryKeys.related("org", "other"),
    queryKeys.activity("org", "other"),
    queryKeys.messagePage("org", "conversation", ["message"]),
    queryKeys.project("org", "launch"),
    queryKeys.notificationUnread("org"),
  ];
  expect(matchedKeys(event, [...refreshed, ...untouched])).toEqual(refreshed);
  // Conversation deletion sends no IDs, so every reference view refreshes.
  expect(matchedKeys(change("context"), untouched.slice(0, 3))).toEqual(untouched.slice(0, 3));
});

test("workspace detail changes refresh organization details and invitations, not workspace records", () => {
  const client = new QueryClient();
  const refreshed = [
    queryKeys.organizations,
    queryKeys.userInvitations,
    queryKeys.organizationDetail("org"),
    queryKeys.invitations("org"),
    queryKeys.organizationSummary("org"),
    queryKeys.organizationPeople("org"),
  ];
  const kept = [
    queryKeys.conversations("org"),
    queryKeys.projects("org"),
    // Moving a task between projects sends only an access hint.
    queryKeys.taskLocation("org", "task"),
    [...queryKeys.context("org"), "related", "task"],
  ];
  for (const key of [...refreshed, ...kept]) client.setQueryData(key, []);
  const matched = (domain: "organization" | "access") =>
    new Set(
      realtimeQueryTargets(change(domain), "user").flatMap((target) =>
        client
          .getQueryCache()
          .findAll(target)
          .map((query) => query.queryHash),
      ),
    ).size;
  expect(matched("organization")).toBe(refreshed.length);
  // Access changes can hide or reveal any workspace record.
  expect(matched("access")).toBe(refreshed.length + kept.length);
  client.clear();
});

test("agent-work hints refresh only the owner's agent work in that workspace", () => {
  const [target] = realtimeQueryTargets(change("agent-work"), "user");
  expect(target).toEqual({ queryKey: queryKeys.agentWork("user", "org") });
  const client = new QueryClient();
  const keys = [
    queryKeys.agentWorkRequests("user", "org", "conversation"),
    queryKeys.agentWorkConversation("user", "org", "conversation"),
    queryKeys.agentWorkRequests("user", "other", "conversation"),
    queryKeys.agentWorkNeedsYou("other", "org"),
  ];
  for (const key of keys) client.setQueryData(key, []);
  expect(
    client
      .getQueryCache()
      .findAll({ queryKey: target!.queryKey })
      .map((query) => query.queryKey),
  ).toEqual(keys.slice(0, 2));
  client.clear();
});

test("an access change drops the owner's cached agent work for that workspace only", async () => {
  const client = new QueryClient();
  const here = queryKeys.agentWorkNeedsYou("user", "org");
  const local = queryKeys.agentWorkConversation("user", "org", "conversation");
  const elsewhere = queryKeys.agentWorkNeedsYou("user", "other");
  for (const key of [here, local, elsewhere]) client.setQueryData(key, { requests: [] });
  const cache = createRealtimeCache({
    queryClient: client,
    organizationId: "org",
    userId: "user",
    revalidate: async () => {},
  });
  try {
    await cache.receive(change("access"));
    expect(client.getQueryData(here)).toBeUndefined();
    expect(client.getQueryData(local)).toBeUndefined();
    expect(client.getQueryData(elsewhere)).toEqual({ requests: [] });
  } finally {
    cache.dispose();
    client.clear();
  }
});

test("conversation hints refresh root and reply targets without crossing conversation or workspace boundaries", async () => {
  const client = new QueryClient();
  const scopes = [
    ["org", "viewed", "root"],
    ["org", "viewed", "reply"],
    ["org", "other", "root"],
    ["foreign", "viewed", "root"],
  ] as const;
  const reads = [0, 0, 0, 0];
  const observers = scopes.map(([org, conversation, message], index) => {
    const read = async () => {
      reads[index]++;
      return "fresh";
    };
    return new QueryObserver(client, {
      queryKey: [...queryKeys.messageTargets(org, conversation), message],
      initialData: "old",
      staleTime: Infinity,
      queryFn: () => read(),
    });
  });
  const unsubscribes = observers.map((observer) => observer.subscribe(() => {}));
  const cache = createRealtimeCache({
    queryClient: client,
    organizationId: "org",
    userId: "user",
    revalidate: async () => {},
    batchMs: 5,
  });
  try {
    await cache.receive({ ...change("messaging", "foreign"), conversationId: "viewed" });
    await advanceTimersAsync(25);
    expect(reads).toEqual([0, 0, 0, 0]);
    await cache.receive({ ...change("messaging"), conversationId: "viewed" });
    await advanceTimersAsync(25);
    expect(observers.map((observer) => observer.getCurrentResult().data)).toEqual([
      "fresh",
      "fresh",
      "old",
      "old",
    ]);
    expect(reads).toEqual([1, 1, 0, 0]);
    await cache.receive(change("messaging"));
    await advanceTimersAsync(25);
    expect(reads).toEqual([2, 2, 1, 0]);
  } finally {
    cache.dispose();
    unsubscribes.forEach((unsubscribe) => unsubscribe());
    client.clear();
  }
});

test("conversation hints refresh only matching mounted context pages, with a broad unhinted fallback", async () => {
  const client = new QueryClient();
  const reads = [0, 0];
  const observers = ["viewed", "other"].map((id, index) => {
    const read = async () => {
      reads[index]++;
      return ["fresh"];
    };
    return new QueryObserver(client, {
      queryKey: [...queryKeys.context("org"), "message-pages", id, [id]],
      initialData: ["old"],
      staleTime: Infinity,
      queryFn: () => read(),
    });
  });
  const unsubscribes = observers.map((observer) => observer.subscribe(() => {}));
  const cache = createRealtimeCache({
    queryClient: client,
    organizationId: "org",
    userId: "user",
    revalidate: async () => {},
    batchMs: 5,
  });
  try {
    await cache.receive({ ...change("messaging"), conversationId: "other" });
    await advanceTimersAsync(25);
    expect(reads).toEqual([0, 1]);
    expect(observers[0]!.getCurrentResult().data).toEqual(["old"]);
    await cache.receive({ ...change("messaging"), conversationId: "viewed" });
    await advanceTimersAsync(25);
    expect(reads).toEqual([1, 1]);
    expect(observers[0]!.getCurrentResult().data).toEqual(["fresh"]);
    await cache.receive(change("messaging"));
    await advanceTimersAsync(25);
    expect(reads).toEqual([2, 2]);
  } finally {
    cache.dispose();
    unsubscribes.forEach((unsubscribe) => unsubscribe());
    client.clear();
  }
});

test("task activity and related context refresh; message changes refresh active search excerpts", async () => {
  for (const domain of ["tasks", "messaging", "context"] as const) {
    const client = new QueryClient();
    const context = queryKeys.context("org");
    const keys = {
      activity: [...context, "activity", "task"],
      related: [...context, "related", "task"],
      search: [...context, "search", { query: "task" }],
      pages: [...context, "search-pages", { query: "message" }],
      notifications: [...context, "notifications"],
    };
    let searchFetches = 0;
    const observer = new QueryObserver(client, {
      queryKey: keys.search,
      initialData: ["existing"],
      staleTime: Infinity,
      queryFn: async () => {
        searchFetches++;
        return ["updated"];
      },
    });
    const unsubscribe = observer.subscribe(() => {});
    for (const key of Object.values(keys)) client.setQueryData(key, ["existing"]);
    const cache = createRealtimeCache({
      queryClient: client,
      organizationId: "org",
      userId: "user",
      revalidate: async () => {},
      batchMs: 5,
    });
    await cache.receive(change(domain));
    await advanceTimersAsync(25);
    expect(client.getQueryState(keys.activity)?.isInvalidated).toBe(domain !== "messaging");
    expect(client.getQueryState(keys.related)?.isInvalidated).toBe(true);
    expect(client.getQueryState(keys.search)?.isInvalidated).toBe(domain !== "messaging");
    expect(client.getQueryState(keys.pages)?.isInvalidated).toBe(true);
    // Only task titles appear in existing notifications; new ones send their own hint.
    expect(client.getQueryState(keys.notifications)?.isInvalidated).toBe(domain === "tasks");
    expect(searchFetches).toBe(domain === "messaging" ? 1 : 0);
    cache.dispose();
    unsubscribe();
    client.clear();
  }
});

test("access clears private organization and harness data before revalidation, preserving other workspaces", async () => {
  const client = new QueryClient();
  const privateKey = queryKeys.project("org", "project");
  const harnessKey = queryKeys.localAgentConfiguration("user", "org", "agent", "local");
  const otherKey = queryKeys.project("other", "project");
  client.setQueryData(privateKey, "private");
  client.setQueryData(harnessKey, "private config");
  client.setQueryData(otherKey, "other");
  let revalidated = 0;
  const cache = createRealtimeCache({
    queryClient: client,
    organizationId: "org",
    userId: "user",
    revalidate: async () => {
      expect(client.getQueryData(privateKey)).toBeUndefined();
      expect(client.getQueryData(harnessKey)).toBeUndefined();
      revalidated++;
    },
  });
  await cache.receive(change("access", "other"));
  expect(client.getQueryData(privateKey)).toBe("private");
  await cache.receive(change("access"));
  expect(revalidated).toBe(1);
  expect(client.getQueryData(otherKey)).toBe("other");
  cache.dispose();
  client.clear();
});

test("context changes refetch known context families only, leaving notifications fresh and both search families stale", async () => {
  const client = new QueryClient();
  const context = queryKeys.context("org");
  const keys = [
    ...["activity", "related", "message-pages", "target"].map((kind) => [
      ...context,
      kind,
      "record",
    ]),
    [...context, "notifications"],
    [...context, "search", "term"],
    [...context, "search-pages", "term"],
    [...context, "unknown"],
    [...context, "notifications", "page", "unread", "cursor"],
    [...queryKeys.context("other"), "related", "record"],
    queryKeys.projects("org"),
    queryKeys.conversations("org"),
  ];
  const reads = keys.map(() => 0);
  const observers = keys.map((queryKey, index) => {
    const read = async () => {
      reads[index]++;
      return ["fresh"];
    };
    return new QueryObserver(client, {
      queryKey,
      initialData: ["old"],
      staleTime: Infinity,
      queryFn: () => read(),
    });
  });
  const unsubscribes = observers.map((observer) => observer.subscribe(() => {}));
  const cache = createRealtimeCache({
    queryClient: client,
    organizationId: "org",
    userId: "user",
    revalidate: async () => {},
    batchMs: 5,
  });
  try {
    await client.invalidateQueries({ queryKey: context });
    reads.fill(0);
    await cache.receive(change("context"));
    await advanceTimersAsync(25);
    expect(reads).toEqual([1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(client.getQueryState(keys[5]!)?.isInvalidated).toBe(true);
    expect(client.getQueryState(keys[6]!)?.isInvalidated).toBe(true);
  } finally {
    cache.dispose();
    unsubscribes.forEach((unsubscribe) => unsubscribe());
    client.clear();
  }
});

test("task edits refresh titles shown by message links and existing notifications, not pages without links", async () => {
  const client = new QueryClient();
  const linked = [...queryKeys.context("org"), "message-pages", "conversation", ["message"]];
  const plain = [...queryKeys.context("org"), "message-pages", "conversation", ["plain"]];
  const notifications = [...queryKeys.context("org"), "notifications"];
  client.setQueryData(linked, [{ links: [{ entityId: "task", title: "Old task title" }] }]);
  client.setQueryData(plain, [{ links: [] }]);
  client.setQueryData(notifications, [{ title: "Old task title" }]);
  const cache = createRealtimeCache({
    queryClient: client,
    organizationId: "org",
    userId: "user",
    revalidate: async () => {},
    batchMs: 5,
  });
  await cache.receive(change("tasks"));
  await advanceTimersAsync(25);
  expect(client.getQueryState(linked)?.isInvalidated).toBe(true);
  expect(client.getQueryState(notifications)?.isInvalidated).toBe(true);
  expect(client.getQueryState(plain)?.isInvalidated).toBe(false);
  // Reference changes can add links, so they still refresh every page.
  await cache.receive(change("context"));
  await advanceTimersAsync(25);
  expect(client.getQueryState(plain)?.isInvalidated).toBe(true);
  cache.dispose();
  client.clear();
});

test("a task hint refreshes one mounted fifty-message context page, and a denied access recheck erases it", async () => {
  const client = new QueryClient();
  const key = [
    ...queryKeys.context("org"),
    "message-pages",
    "conversation",
    Array.from({ length: 50 }, (_, i) => `message-${i}`),
  ];
  let reads = 0;
  let title = "Old work title";
  const read = async () => {
    reads++;
    return Array.from({ length: 50 }, () => ({ links: [{ entityId: "task", title }] }));
  };
  const observer = new QueryObserver(client, {
    queryKey: key,
    staleTime: Infinity,
    retry: false,
    queryFn: () => read(),
  });
  const unsubscribe = observer.subscribe(() => {});
  await observer.refetch();
  expect(reads).toBe(1);
  const cache = createRealtimeCache({
    queryClient: client,
    organizationId: "org",
    userId: "user",
    revalidate: async () => {},
    batchMs: 5,
  });
  try {
    title = "Updated work title";
    await cache.receive(change("tasks"));
    await advanceTimersAsync(25);
    expect(reads).toBe(2);
    expect(client.getQueryData(key)).toEqual(
      Array.from({ length: 50 }, () => ({ links: [{ entityId: "task", title }] })),
    );
    const blocked = Promise.withResolvers<{ links: { entityId: string; title: string }[] }[]>();
    observer.setOptions({ ...observer.options, queryFn: () => blocked.promise });
    const reset = cache.receive(change("access"));
    // The page stays on screen while access is checked again.
    expect(observer.getCurrentResult().data).toHaveLength(50);
    blocked.reject(Object.assign(new Error("Forbidden"), { status: 403 }));
    await reset;
    expect(observer.getCurrentResult().data).toBeUndefined();
  } finally {
    cache.dispose();
    unsubscribe();
    client.clear();
  }
});

test("duplicate changes coalesce and ready resyncs cached state", async () => {
  const client = new QueryClient();
  const key = queryKeys.projects("org");
  client.setQueryData(key, []);
  const cache = createRealtimeCache({
    queryClient: client,
    organizationId: "org",
    userId: "user",
    revalidate: async () => {},
    batchMs: 5,
  });
  const event = change("tasks");
  await cache.receive(event);
  await cache.receive(event);
  await advanceTimersAsync(25);
  expect(client.getQueryState(key)?.isInvalidated).toBe(true);
  client.setQueryData(key, ["new"]);
  await cache.receive(event);
  await advanceTimersAsync(25);
  expect(client.getQueryState(key)?.isInvalidated).toBe(false);
  await cache.receive({ version: 1, type: "ready" });
  expect(client.getQueryState(key)?.isInvalidated).toBe(true);
  cache.dispose();
  client.clear();
});

test("changes during a slow refresh share one follow-up snapshot", async () => {
  const client = new QueryClient();
  const key = queryKeys.messages("org", "conversation");
  const first = Promise.withResolvers<void>();
  let snapshot = 0;
  let reads = 0;
  const read = async () => {
    const value = snapshot;
    if (++reads === 1) await first.promise;
    return value;
  };
  const observer = new QueryObserver(client, {
    queryKey: key,
    initialData: 0,
    staleTime: Infinity,
    queryFn: () => read(),
  });
  const unsubscribe = observer.subscribe(() => {});
  const threadKey = queryKeys.messages("org", "conversation", "thread");
  let threadReads = 0;
  const readThread = async () => {
    threadReads++;
    return snapshot;
  };
  const threadObserver = new QueryObserver(client, {
    queryKey: threadKey,
    initialData: 0,
    staleTime: Infinity,
    queryFn: () => readThread(),
  });
  const unsubscribeThread = threadObserver.subscribe(() => {});
  const cache = createRealtimeCache({
    queryClient: client,
    organizationId: "org",
    userId: "user",
    revalidate: async () => {},
    batchMs: 5,
  });
  try {
    snapshot++;
    await cache.receive(change("messaging"));
    await advanceTimersAsync(25);
    for (let index = 0; index < 4; index++) {
      snapshot++;
      await cache.receive(change("messaging"));
      await advanceTimersAsync(25);
    }
    first.resolve();
    await advanceTimersAsync(25);
    expect(client.getQueryData(key)).toBe(snapshot);
    expect(client.getQueryData(threadKey)).toBe(snapshot);
    expect(reads).toBe(2);
    expect(threadReads).toBe(2);
  } finally {
    first.resolve();
    cache.dispose();
    unsubscribe();
    unsubscribeThread();
    client.clear();
  }
});

for (const scenario of ["after", "settled", "before", "none"] as const) {
  test(`an own mutation's realtime echo reuses a read started after the event (${scenario})`, async () => {
    const client = new QueryClient();
    const key = queryKeys.conversations("org");
    const blocked = Promise.withResolvers<void>();
    let reads = 0;
    const read = async () => {
      reads++;
      if (scenario !== "settled") await blocked.promise;
      return "fresh";
    };
    const observer = new QueryObserver(client, {
      queryKey: key,
      initialData: "old",
      staleTime: Infinity,
      queryFn: () => read(),
    });
    const unsubscribe = observer.subscribe(() => {});
    const cache = createRealtimeCache({
      queryClient: client,
      organizationId: "org",
      userId: "user",
      revalidate: async () => {},
      batchMs: 5,
    });
    // The local mutation invalidation starts a read before or after its realtime echo arrives.
    const localRead = () => void client.invalidateQueries({ queryKey: key });
    try {
      if (scenario === "before") localRead();
      await cache.receive(change("messaging"));
      if (scenario === "after" || scenario === "settled") localRead();
      await advanceTimersAsync(25);
      blocked.resolve();
      await advanceTimersAsync(20);
      expect(reads).toBe(scenario === "before" ? 2 : 1);
      expect(client.getQueryData(key)).toBe("fresh");
      expect(client.getQueryState(key)?.isInvalidated).toBe(false);
    } finally {
      blocked.resolve();
      cache.dispose();
      unsubscribe();
      client.clear();
    }
  });
}

test("a later ready resyncs: it drops private values first, and health follows the latest ready", async () => {
  const client = new QueryClient();
  const key = queryKeys.projects("org");
  const health: string[] = [];
  let fail = false;
  const cache = createRealtimeCache({
    queryClient: client,
    organizationId: "org",
    userId: "user",
    revalidate: async () => {
      if (fail) throw new Error("route load failed");
    },
    onHealth: (value) => health.push(value),
  });
  try {
    client.setQueryData(key, ["private"]);
    await cache.receive({ version: 1, type: "ready" });
    // The first ready keeps loaded values and marks them stale.
    expect(client.getQueryData(key)).toEqual(["private"]);
    expect(health).toEqual(["syncing", "fresh"]);
    await cache.receive({ version: 1, type: "ready" });
    // A reconnect may follow a missed revocation, so it drops private values.
    expect(client.getQueryData(key)).toBeUndefined();
    expect(health).toEqual(["syncing", "fresh", "syncing", "fresh"]);
    fail = true;
    const outcome = await cache
      .receive({ version: 1, type: "ready" })
      .catch((error: Error) => error);
    expect(outcome).toMatchObject({ message: "route load failed" });
    expect(health.at(-1)).toBe("stale");
  } finally {
    cache.dispose();
    client.clear();
  }
});
