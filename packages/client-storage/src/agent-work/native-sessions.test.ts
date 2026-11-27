import { openTestStore } from "./test-support.ts";
import { afterEach, beforeEach, expect, test } from "bun:test";

let fixture: Awaited<ReturnType<typeof openTestStore>>;
beforeEach(async () => {
  fixture = await openTestStore();
});
afterEach(() => fixture.cleanup());

async function session(organizationId = "org-1") {
  const sessionId = crypto.randomUUID();
  await fixture.store.nativeSessions.ensure(
    organizationId,
    { sessionId, userAgentId: "agent-1", harness: "claude" },
    0,
  );
  return sessionId;
}

async function open(sessionId: string, policyVersion = 1, organizationId = "org-1") {
  await fixture.store.nativeSessions.opened(
    organizationId,
    sessionId,
    { nativeSessionId: "native", prefix: "prefix", policyVersion },
    1,
  );
}

test("an epoch's first prefix fixes its working folder until the next epoch", async () => {
  const { store } = fixture;
  const id = await session();
  const prefix = (workspace: string | null, policyVersion = 1) =>
    store.nativeSessions.setPrefix("org-1", id, { prefix: "p", policyVersion, workspace }, 1);
  await prefix("C:\\project-a");
  // A rebuilt prefix, such as after a policy change, keeps the folder the session started in.
  await prefix("C:\\project-b", 2);
  expect(await store.nativeSessions.get("org-1", id)).toMatchObject({
    workspace: "C:\\project-a",
    policyVersion: 2,
  });
  await store.nativeSessions.rotate("org-1", id, 2);
  expect((await store.nativeSessions.get("org-1", id))?.workspace).toBeNull();
  await prefix("C:\\project-b");
  expect((await store.nativeSessions.get("org-1", id))?.workspace).toBe("C:\\project-b");
});

test("a session without a native session rotates at once; an open one hands off once", async () => {
  const { store } = fixture;
  const fresh = await session();
  expect(await store.nativeSessions.requestRotation("org-1", fresh, "usage", 1)).toEqual({
    action: "rotated",
  });
  expect((await store.nativeSessions.get("org-1", fresh))!.epoch).toBe(1);

  const opened = await session();
  await open(opened);
  expect(await store.nativeSessions.requestRotation("org-1", opened, "usage", 2)).toEqual({
    action: "submit",
    fromEpoch: 0,
  });
  expect(await store.nativeSessions.requestRotation("org-1", opened, "turns", 3)).toEqual({
    action: "pending",
  });
  await store.nativeSessions.rotate("org-1", opened, 4);
  expect(await store.nativeSessions.get("org-1", opened)).toMatchObject({
    epoch: 1,
    epochTurns: 0,
    nativeSessionId: null,
    prefix: null,
    rotation: null,
  });
});

test("only a higher reset generation starts a new epoch, once", async () => {
  const { store } = fixture;
  const id = await session();
  await open(id);
  expect(await store.nativeSessions.applyReset("org-1", id, 0, 1)).toBe(false);
  expect(await store.nativeSessions.applyReset("org-1", id, 2, 1)).toBe(true);
  expect(await store.nativeSessions.get("org-1", id)).toMatchObject({
    epoch: 1,
    nativeSessionId: null,
    resetGeneration: 2,
  });
  expect(await store.nativeSessions.applyReset("org-1", id, 2, 2)).toBe(false);
  expect((await store.nativeSessions.get("org-1", id))!.epoch).toBe(1);
});

test("outdated policy lists open sessions of one organization that do not rotate yet", async () => {
  const { store } = fixture;
  const current = await session();
  const outdated = await session();
  const rotating = await session();
  const other = await session("org-2");
  // A session that never opened has no prefix to replace.
  await session();
  await open(current, 2);
  await open(outdated);
  await open(rotating);
  await open(other, 1, "org-2");
  await store.nativeSessions.requestRotation("org-1", rotating, "policy", 2);
  expect(await store.nativeSessions.outdatedPolicy("org-1", 2)).toEqual([
    { sessionId: outdated, userAgentId: "agent-1" },
  ]);
  expect(await store.nativeSessions.get("org-2", current)).toBeUndefined();
});
