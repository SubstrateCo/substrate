import { sessionKeys } from "@substrate/contracts/agent-work";

import { openTestStore } from "./test-support.ts";
import { afterEach, beforeEach, expect, test } from "bun:test";

let fixture: Awaited<ReturnType<typeof openTestStore>>;
beforeEach(async () => {
  fixture = await openTestStore();
});
afterEach(() => fixture.cleanup());

const fields = {
  organizationId: "org-1",
  userAgentId: "agent-1",
  name: "Digest",
  prompt: "Summarize the day.",
  cron: "0 9 * * *",
  timezone: "Europe/Berlin",
  destinationConversationId: crypto.randomUUID(),
  destinationThreadId: null,
  enabled: true,
};
const target = { agentId: "agent-1", harness: "claude" as const };

const scheduledRoutine = () => fixture.store.routines.create(fields, 1000, 0);

test("a routine fires each occurrence once", async () => {
  const { store } = fixture;
  const routine = await scheduledRoutine();
  const fire = {
    routineId: routine.id,
    revision: 1,
    occurrence: 1000,
    nextFireAt: 2000,
    ...target,
  };
  expect(await store.routines.fire(fire, 1000)).toBeDefined();
  expect(await store.routines.fire(fire, 1001)).toBeUndefined();
  const session = await store.sessions.byKey("agent-1", sessionKeys.routine(routine.id));
  expect(await store.inbox.openForSessions([session!.id])).toHaveLength(1);
});

test("a newer tick supersedes the routine's older pending tick", async () => {
  const { store } = fixture;
  const routine = await scheduledRoutine();
  const first = await store.routines.fire(
    { routineId: routine.id, revision: 1, occurrence: 1000, nextFireAt: 2000, ...target },
    1000,
  );
  const second = await store.routines.fire(
    { routineId: routine.id, revision: 1, occurrence: 2000, nextFireAt: 3000, ...target },
    2000,
  );
  expect((await store.inbox.get("org-1", first!.id))!.status).toBe("superseded");
  expect((await store.inbox.get("org-1", second!.id))!.status).toBe("pending");
  expect((await store.routines.get(routine.id))!.nextFireAt).toBe(3000);
});

test("an edited routine is due at once, and a tick computed from the old revision does not fire", async () => {
  const { store } = fixture;
  const routine = await scheduledRoutine();
  const edited = await store.routines.update(routine.id, { prompt: "Changed." }, 1000);
  expect(edited.revision).toBe(2);
  expect((await store.routines.due("org-1", 1000)).map((row) => row.id)).toEqual([routine.id]);
  expect(
    await store.routines.fire(
      { routineId: routine.id, revision: 1, occurrence: 1000, nextFireAt: 2000, ...target },
      1000,
    ),
  ).toBeUndefined();
  expect(
    await store.routines.fire(
      { routineId: routine.id, revision: 2, occurrence: 1000, nextFireAt: 2000, ...target },
      1000,
    ),
  ).toBeDefined();
});

test("a paused routine is not due", async () => {
  const { store } = fixture;
  const routine = await scheduledRoutine();
  await store.routines.update(routine.id, { enabled: false }, 1000);
  expect(await store.routines.due("org-1", 1000)).toEqual([]);
});
