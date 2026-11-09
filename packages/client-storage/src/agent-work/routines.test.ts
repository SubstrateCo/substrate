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

async function approvedRoutine() {
  const { store } = fixture;
  const routine = await store.routines.create(fields, 0);
  return store.routines.approve(routine.id, routine.revision, 1000);
}

test("a routine fires each occurrence once", async () => {
  const { store } = fixture;
  const routine = await approvedRoutine();
  const fire = {
    routineId: routine.id,
    revision: 1,
    occurrence: 1000,
    nextFireAt: 2000,
    ...target,
  };
  expect(await store.routines.fire(fire, 1000)).toBeDefined();
  expect(await store.routines.fire(fire, 1001)).toBeUndefined();
  const session = await store.sessions.byKey("agent-1", `routine:${routine.id}`);
  expect(await store.inbox.openForSessions([session!.id])).toHaveLength(1);
});

test("a newer tick supersedes the routine's older pending tick", async () => {
  const { store } = fixture;
  const routine = await approvedRoutine();
  const first = await store.routines.fire(
    { routineId: routine.id, revision: 1, occurrence: 1000, nextFireAt: 2000, ...target },
    1000,
  );
  const second = await store.routines.fire(
    { routineId: routine.id, revision: 1, occurrence: 2000, nextFireAt: 3000, ...target },
    2000,
  );
  expect((await store.inbox.get(first!.id))!.status).toBe("superseded");
  expect((await store.inbox.get(second!.id))!.status).toBe("pending");
  expect((await store.routines.get(routine.id))!.nextFireAt).toBe(3000);
});

test("an edit creates a revision that does not run until it is approved", async () => {
  const { store } = fixture;
  const routine = await approvedRoutine();
  const edited = await store.routines.update(routine.id, { prompt: "Changed." }, 1000);
  expect(edited).toMatchObject({ revision: 2, approvedRevision: 1 });
  expect(
    await store.routines.fire(
      { routineId: routine.id, revision: 2, occurrence: 1000, nextFireAt: 2000, ...target },
      1000,
    ),
  ).toBeUndefined();
  // oxlint-disable-next-line typescript/await-thenable -- Bun rejection assertions are asynchronous despite their assertion return declarations.
  await expect(store.routines.approve(routine.id, 1, 1000)).rejects.toThrow();
  expect((await store.routines.update(routine.id, { enabled: false }, null)).revision).toBe(2);
});
