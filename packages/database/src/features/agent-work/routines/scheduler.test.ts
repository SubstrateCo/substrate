import { sessionKeys } from "@substrate/contracts/agent-work";

import { agentRoutines, agentSessions, userAgents } from "../../../schema";
import { setupDatabase } from "../../../testing/database";
import { hostFixture } from "../../../testing/host";
import { createRoutine, type NewRoutine } from "./routines";
import { fireDueRoutines } from "./scheduler";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

const f = setupDatabase();

const at = (value: string) => new Date(value);

async function scheduled(input: Partial<NewRoutine> = {}, author: "owner" | "agent" = "owner") {
  const x = await hostFixture(f);
  const routine = await x.run((tx) =>
    createRoutine(
      tx,
      x.owner,
      x.agent.agentId,
      {
        name: "Digest",
        prompt: "Summarize the day.",
        cron: "0 16 * * *",
        timezone: "America/New_York",
        enabled: true,
        destination: null,
        ...input,
      },
      author,
      at("2026-03-07T12:00:00Z"),
    ),
  );
  const fire = (now: Date) => x.run((tx) => fireDueRoutines(tx, now));
  const row = async () =>
    (await f.db.select().from(agentRoutines).where(eq(agentRoutines.id, routine.id)))[0]!;
  return { ...x, routine, fire, row };
}

test("a due routine queues one item in its own session and moves to its next local time", async () => {
  const x = await scheduled();
  // 4 PM in New York, before daylight saving time starts.
  expect(x.routine.nextFireAt?.toISOString()).toBe("2026-03-07T21:00:00.000Z");
  expect(await x.fire(at("2026-03-07T20:59:00Z"))).toBe(0);
  expect(await x.fire(at("2026-03-07T21:00:05Z"))).toBe(1);
  const [item] = await x.items();
  expect(item).toMatchObject({
    source: "routine",
    body: "Summarize the day.",
    sourceRef: {
      source: "routine",
      routineId: x.routine.id,
      revision: 1,
      scheduledAt: "2026-03-07T21:00:00.000Z",
    },
  });
  const [session] = await f.db
    .select()
    .from(agentSessions)
    .where(eq(agentSessions.id, item!.sessionId));
  expect(session).toMatchObject({
    key: sessionKeys.routine(x.routine.id),
    destinationConversationId: x.dm.id,
  });
  // The next day is after the switch to daylight saving time: still 4 PM local.
  expect(await x.row()).toMatchObject({
    lastFiredAt: at("2026-03-07T21:00:00Z"),
    nextFireAt: at("2026-03-08T20:00:00Z"),
  });
});

test("missed ticks collapse into the latest, which supersedes the tick no turn took", async () => {
  const x = await scheduled();
  await x.fire(at("2026-03-07T21:00:05Z"));
  // Two days pass without a host: one more fire, for the latest occurrence.
  expect(await x.fire(at("2026-03-09T22:00:00Z"))).toBe(1);
  expect(
    (await x.items()).map((item) => [
      item.status,
      item.sourceRef.source === "routine" && item.sourceRef.scheduledAt,
    ]),
  ).toEqual([
    ["superseded", "2026-03-07T21:00:00.000Z"],
    ["pending", "2026-03-09T20:00:00.000Z"],
  ]);
  expect((await x.row()).nextFireAt).toEqual(at("2026-03-10T20:00:00Z"));
});

test("unapproved, paused, and disabled agents' routines do not fire", async () => {
  const unapproved = await scheduled({}, "agent");
  expect(await unapproved.fire(at("2026-03-07T21:00:05Z"))).toBe(0);
  await f.db
    .update(agentRoutines)
    .set({ approvedRevision: 1, enabled: false })
    .where(eq(agentRoutines.id, unapproved.routine.id));
  expect(await unapproved.fire(at("2026-03-07T21:00:05Z"))).toBe(0);
  await f.db
    .update(agentRoutines)
    .set({ enabled: true })
    .where(eq(agentRoutines.id, unapproved.routine.id));
  await f.db
    .update(userAgents)
    .set({ enabled: false })
    .where(eq(userAgents.id, unapproved.agent.agentId));
  expect(await unapproved.fire(at("2026-03-07T21:00:05Z"))).toBe(0);
  expect(await unapproved.items()).toEqual([]);
});
