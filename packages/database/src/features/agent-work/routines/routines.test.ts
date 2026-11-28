import { sessionKeys } from "@substrate/contracts/agent-work";

import { AccessDeniedError, ConflictError, ValidationError } from "../../../errors";
import { agentSessions } from "../../../schema";
import { ownerAgentWork } from "../../../testing/agent-work";
import { setupDatabase } from "../../../testing/database";
import { hostFixture } from "../../../testing/host";
import { rejection } from "../../../testing/rejection";
import {
  approveRoutine,
  createRoutine,
  requireRoutine,
  updateRoutine,
  type NewRoutine,
} from "./routines";
import { fireDueRoutines } from "./scheduler";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

const f = setupDatabase();

const daily: NewRoutine = {
  name: "Digest",
  prompt: "Summarize the day.",
  cron: "0 9 * * *",
  timezone: "Europe/Berlin",
  enabled: true,
  destination: null,
};

async function routines() {
  const x = await hostFixture(f);
  const owner = await ownerAgentWork(f.db, x.owner);
  const agentCreate = (input: Partial<NewRoutine> = {}) =>
    x.run((tx) => createRoutine(tx, x.owner, x.agent.agentId, { ...daily, ...input }, "agent"));
  const row = (id: string) => requireRoutine(f.db, x.owner, id);
  return { ...x, owner: x.owner, repository: owner, agentCreate, row };
}

test("the owner's routine is approved as saved and posts to the owner's DM with the agent", async () => {
  const x = await routines();
  const { result } = await x.repository.createRoutine(x.agent.agentId, daily);
  expect(result).toMatchObject({
    revision: 1,
    approvedRevision: 1,
    destination: { conversationId: x.dm.id, threadId: null },
    enabled: true,
  });
  expect(Date.parse(result.nextFireAt!)).toBeGreaterThan(Date.now());
  expect(await x.repository.listRoutines(x.agent.agentId)).toEqual([result]);
});

test("a routine the agent creates or revises waits for the owner; pausing keeps the approval", async () => {
  const x = await routines();
  const created = await x.agentCreate();
  expect(created.approvedRevision).toBeNull();
  await x.repository.approveRoutine(created.id, 1);
  const paused = await x.run(async (tx) =>
    updateRoutine(tx, await x.row(created.id), { enabled: false }, "agent"),
  );
  expect(paused).toMatchObject({ revision: 1, approvedRevision: 1, enabled: false });
  const revised = await x.run(async (tx) =>
    updateRoutine(tx, await x.row(created.id), { prompt: "Summarize the week." }, "agent"),
  );
  expect(revised).toMatchObject({ revision: 2, approvedRevision: 1 });
  const { result } = await x.repository.updateRoutine(created.id, { cron: "0 10 * * *" });
  expect(result).toMatchObject({ revision: 3, approvedRevision: 3 });
});

test("approval names a revision; a routine that changed since is a conflict", async () => {
  const x = await routines();
  const created = await x.agentCreate();
  await x.run(async (tx) =>
    updateRoutine(tx, await x.row(created.id), { name: "Weekly" }, "agent"),
  );
  expect(await rejection(x.repository.approveRoutine(created.id, 1))).toBeInstanceOf(ConflictError);
  const { result } = await x.repository.approveRoutine(created.id, 2);
  expect(result).toMatchObject({ revision: 2, approvedRevision: 2 });
});

test("a routine checks its schedule and destination, and is its owner's only", async () => {
  const x = await routines();
  expect(await rejection(x.agentCreate({ cron: "61 * * * *" }))).toBeInstanceOf(ValidationError);
  const hidden = await x.bob.createConversation({
    kind: "channel",
    name: "bob-only",
    private: true,
  });
  expect(
    await rejection(x.agentCreate({ destination: { conversationId: hidden.id, threadId: null } })),
  ).toBeInstanceOf(AccessDeniedError);
  const created = await x.agentCreate();
  const bob = await ownerAgentWork(f.db, { userId: "bob", organizationId: f.orgA });
  expect(await rejection(bob.approveRoutine(created.id, 1))).toBeInstanceOf(AccessDeniedError);
  expect(await rejection(bob.deleteRoutine(created.id))).toBeInstanceOf(AccessDeniedError);
});

test("a new destination moves the routine's session, and deleting drops its queued run", async () => {
  const x = await routines();
  const { result: routine } = await x.repository.createRoutine(x.agent.agentId, daily);
  await x.run((tx) => fireDueRoutines(tx, new Date(Date.parse(routine.nextFireAt!) + 1000)));
  const channel = await x.alice.createConversation({ kind: "channel", name: "general" });
  await x.repository.updateRoutine(routine.id, {
    destination: { conversationId: channel.id, threadId: null },
  });
  const [session] = await f.db
    .select()
    .from(agentSessions)
    .where(eq(agentSessions.key, sessionKeys.routine(routine.id)));
  expect(session).toMatchObject({
    destinationConversationId: channel.id,
    destinationThreadId: null,
  });
  await x.repository.deleteRoutine(routine.id);
  expect((await x.items()).map((item) => [item.source, item.status, item.reason])).toEqual([
    ["routine", "dropped", "routine_deleted"],
  ]);
  expect(await x.repository.listRoutines(x.agent.agentId)).toEqual([]);
});

test("approving runs from the next occurrence after now", async () => {
  const x = await routines();
  const created = await x.agentCreate({ cron: "* * * * *" });
  const later = new Date(Date.now() + 10 * 60_000);
  const approved = await x.run(async (tx) => approveRoutine(tx, await x.row(created.id), 1, later));
  expect(approved.nextFireAt!.getTime()).toBeGreaterThan(later.getTime());
});
