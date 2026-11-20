import type { EndpointName } from "../endpoints.ts";
import type { World } from "../world.ts";
import { beforeEach, expect, mock, test } from "bun:test";

mock.module("../config.ts", () => ({ config: { realtime: true } }));
mock.module("../debug.ts", () => ({ trace() {} }));
mock.module("../metrics.ts", () => ({ refetches: { add() {} } }));
mock.module("./pictures.ts", () => ({ showPictures() {}, hidePictures() {} }));

let removed = false;
let rejected = false;
let writes = 0;
let readPosts = 0;
let contextGate: Promise<unknown[]> | undefined;
let contextStarted: (() => void) | undefined;
let shownMessage = "message";
const staleReads: string[] = [];
const message = { id: "message", conversationId: "conversation", authorImage: null };
mock.module("../http.ts", () => ({
  async call(endpoint: EndpointName) {
    if (
      endpoint === "messaging.conversations.leave" ||
      endpoint === "messaging.conversations.delete"
    ) {
      writes++;
      if (rejected) return null;
      removed = true;
      await cache.refreshAll("hint");
      return {};
    }
    if (
      removed &&
      [
        "messaging.messages",
        "context.messagePage",
        "messaging.read",
        "agentWork.requests",
        "agentWork.callsMine",
      ].includes(endpoint)
    ) {
      staleReads.push(endpoint);
      return null;
    }
    if (endpoint === "messaging.messages") return [{ ...message, id: shownMessage }];
    if (endpoint === "context.messagePage" && contextGate) {
      contextStarted?.();
      return contextGate;
    }
    if (endpoint === "messaging.read") readPosts++;
    return [];
  },
}));

const cache = await import("../client-cache.ts");
const messaging = await import("./messaging.ts");
const conversations = await import("./conversations.ts");
const { keys } = await import("../keys.ts");
const { createWorld } = await import("../world.ts");
let world: World;

beforeEach(async () => {
  cache.resetCache();
  removed = rejected = false;
  writes = 0;
  readPosts = 0;
  contextGate = undefined;
  contextStarted = undefined;
  shownMessage = "message";
  staleReads.length = 0;
  world = createWorld({
    userId: "user",
    organizationId: "org",
    email: "load@example.test",
    name: "User",
  });
  await messaging.openConversation(world, "conversation");
  await messaging.openThread(world, "message");
});

for (const action of ["leaveConversation", "deleteConversation"] as const) {
  test(`${action} detaches the pane before a committed write publishes hints`, async () => {
    expect(await conversations[action](world, "conversation")).toBe(true);
    await cache.refreshAll("reconcile");
    expect(staleReads).toEqual([]);
    expect(world.screen).toEqual({});
    expect(cache.cached(keys.messages("org", "conversation", null))).toBeUndefined();
    expect(world.contextIds.has("conversation")).toBe(false);
  });

  test(`${action} restores the pane when the write fails`, async () => {
    rejected = true;
    expect(await conversations[action](world, "conversation")).toBe(false);
    expect(world.screen.conversationId).toBe("conversation");
    expect(world.screen.threadId).toBe("message");
  });
}

test("delete waits for detached reads before removing their server data", async () => {
  let resolve!: (rows: unknown[]) => void;
  let blocked = false;
  await cache.mount(keys.messages("org", "conversation", null), () => {
    if (!blocked) return Promise.resolve([message]);
    return new Promise<unknown[]>((done) => {
      resolve = done;
    });
  });
  blocked = true;
  const read = cache.invalidate([keys.messages("org", "conversation", null)], "hint");
  const write = conversations.deleteConversation(world, "conversation");
  await Promise.resolve();
  expect(writes).toBe(0);
  resolve([message]);
  await read;
  expect(await write).toBe(true);
  expect(staleReads).toEqual([]);
});

test("a detached message fetch does not post a read or remount its context after teardown", async () => {
  let resolve!: (rows: unknown[]) => void;
  let started!: () => void;
  const readingContext = new Promise<void>((done) => {
    started = done;
  });
  contextGate = new Promise<unknown[]>((done) => {
    resolve = done;
  });
  contextStarted = started;
  shownMessage = "new-message";
  const before = readPosts;
  const read = cache.invalidate([keys.messages("org", "conversation", null)], "hint");
  await readingContext;
  const write = conversations.deleteConversation(world, "conversation");
  resolve([]);
  await read;
  expect(await write).toBe(true);
  await cache.refreshAll("reconcile");
  expect(readPosts).toBe(before);
  expect(staleReads).toEqual([]);
});
