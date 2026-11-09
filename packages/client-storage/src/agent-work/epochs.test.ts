import { createSession, item, openTestStore } from "./test-support.ts";
import { afterEach, beforeEach, expect, test } from "bun:test";

let fixture: Awaited<ReturnType<typeof openTestStore>>;
beforeEach(async () => {
  fixture = await openTestStore();
});
afterEach(() => fixture.cleanup());

test("rotation waits for the live turn, runs the handoff alone, then owner items run in the new epoch", async () => {
  const { store } = fixture;
  const session = await createSession(store);
  await store.inbox.intake([item(session)], 0);
  const [live] = await store.turns.claim(1);
  await store.sessions.opened(
    session.id,
    { nativeSessionId: "n1", prefix: "p", policyVersion: 1 },
    1,
  );

  expect(await store.epochs.requestRotation(session.id, "new_topic", "Hand off.", 2)).toBe(
    "pending",
  );
  await store.inbox.intake([item(session)], 3);
  expect(await store.turns.claim(4)).toEqual([]);

  await store.turns.finish(live!.turn.id, { status: "completed" }, 5);
  const [handoff] = await store.turns.claim(6);
  expect(handoff!.turn).toMatchObject({ handoff: true, kind: "unattended", epoch: 0 });
  expect(handoff!.items.map((row) => row.source)).toEqual(["epoch"]);

  await store.turns.finish(handoff!.turn.id, { status: "completed" }, 7);
  expect(await store.sessions.get(session.id)).toMatchObject({
    epoch: 1,
    nativeSessionId: null,
    prefix: null,
    rotation: null,
  });
  const [next] = await store.turns.claim(8);
  expect(next!.turn).toMatchObject({ epoch: 1, kind: "interactive", handoff: false });
});

test("outdated policy sessions are listed for one organization only", async () => {
  const { store } = fixture;
  const own = await createSession(store);
  const other = await store.sessions.ensure(
    {
      organizationId: "org-2",
      userAgentId: "agent-2",
      agentId: "agent-2",
      key: "dm:other",
      kind: "dm",
      harness: "claude",
    },
    0,
  );
  for (const session of [own, other])
    await store.sessions.opened(
      session.id,
      { nativeSessionId: "n", prefix: "p", policyVersion: 1 },
      1,
    );
  expect((await store.sessions.outdatedPolicy(2, "org-1")).map((row) => row.id)).toEqual([own.id]);
});

test("a session without a native session rotates at once", async () => {
  const { store } = fixture;
  const session = await createSession(store);
  expect(await store.epochs.requestRotation(session.id, "new_topic", "Hand off.", 0)).toBe(
    "rotated",
  );
  expect((await store.sessions.get(session.id))!.epoch).toBe(1);
});
