import { sessionKeys } from "@substrate/contracts/agent-work";

import { userAgents } from "../../core/actors/user-agents.schema";
import { registerDevice } from "../../core/devices/repository";
import { AccessDeniedError } from "../../errors";
import { ownedAgent } from "../../testing/agents";
import { setupDatabase } from "../../testing/database";
import { waitForLockWaiters } from "../../testing/locks";
import { recordQueries } from "../../testing/queries";
import { rejection } from "../../testing/rejection";
import { findToolReceipt, requireHomeDevice, saveToolReceipt } from "./repository";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

const f = setupDatabase();

test("home-device access binds the actor, owner and registered installation", async () => {
  const agent = await ownedAgent(f);
  const identity = { userId: "alice", organizationId: f.orgA };
  const { db, queries } = recordQueries();
  expect(
    await db.transaction((tx) =>
      requireHomeDevice(tx, identity, agent.actorId, agent.identity.installationId),
    ),
  ).toBe(agent.agentId);
  expect(queries.filter((query) => query.startsWith("select "))).toHaveLength(1);
  const other = await registerDevice(f.db, "alice", {
    installationId: crypto.randomUUID(),
    name: "Other desktop",
    platform: "win32",
  });
  const foreign = await registerDevice(f.db, "bob", {
    installationId: crypto.randomUUID(),
    name: "Foreign desktop",
    platform: "win32",
  });
  for (const [owner, installation] of [
    [identity, undefined],
    [identity, crypto.randomUUID()],
    [identity, other.installationId],
    [identity, foreign.installationId],
    [{ ...identity, userId: "bob" }, agent.identity.installationId],
  ] as const) {
    expect(
      await rejection(
        f.db.transaction((tx) => requireHomeDevice(tx, owner, agent.actorId, installation)),
      ),
    ).toBeInstanceOf(AccessDeniedError);
  }
  await f.db.update(userAgents).set({ homeDeviceId: null }).where(eq(userAgents.id, agent.agentId));
  expect(
    await rejection(
      f.db.transaction((tx) =>
        requireHomeDevice(tx, identity, agent.actorId, agent.identity.installationId),
      ),
    ),
  ).toBeInstanceOf(AccessDeniedError);
});

test("home-device checks refresh a registration committed while waiting for the home lock", async () => {
  const agent = await ownedAgent(f);
  const installationId = crypto.randomUUID();
  const { db, queries } = recordQueries();
  let release!: () => void;
  let locked!: () => void;
  const held = new Promise<void>((resolve) => {
    locked = resolve;
  });
  const finish = new Promise<void>((resolve) => {
    release = resolve;
  });
  const changeHome = f.db.transaction(async (tx) => {
    await tx.select().from(userAgents).where(eq(userAgents.id, agent.agentId)).for("update");
    locked();
    await finish;
    const device = await registerDevice(tx, "alice", {
      installationId,
      name: "New home",
      platform: "win32",
    });
    await tx
      .update(userAgents)
      .set({ homeDeviceId: device.id })
      .where(eq(userAgents.id, agent.agentId));
  });
  await held;
  const check = db.transaction((tx) =>
    requireHomeDevice(tx, agent.identity, agent.actorId, installationId),
  );
  const oldHome = rejection(
    f.db.transaction((tx) =>
      requireHomeDevice(tx, agent.identity, agent.actorId, agent.identity.installationId),
    ),
  );
  try {
    await waitForLockWaiters(2);
  } finally {
    release();
    await changeHome;
  }
  expect(await check).toBe(agent.agentId);
  expect(await oldHome).toBeInstanceOf(AccessDeniedError);
  expect(queries.filter((query) => query.startsWith("select "))).toHaveLength(2);
});

test("home-device checks hold the home assignment until their transaction commits", async () => {
  const agent = await ownedAgent(f);
  let release!: () => void;
  let locked!: () => void;
  const held = new Promise<void>((resolve) => {
    locked = resolve;
  });
  const finish = new Promise<void>((resolve) => {
    release = resolve;
  });
  const check = f.db.transaction(async (tx) => {
    expect(
      await requireHomeDevice(tx, agent.identity, agent.actorId, agent.identity.installationId),
    ).toBe(agent.agentId);
    locked();
    await finish;
  });
  await held;
  const change = f.db
    .update(userAgents)
    .set({ homeDeviceId: null })
    .where(eq(userAgents.id, agent.agentId))
    .execute();
  try {
    await waitForLockWaiters();
  } finally {
    release();
    await check;
    await change;
  }
  expect(
    await rejection(
      f.db.transaction((tx) =>
        requireHomeDevice(tx, agent.identity, agent.actorId, agent.identity.installationId),
      ),
    ),
  ).toBeInstanceOf(AccessDeniedError);
});

test("tool receipts are scoped by organization, actor, tool and request, and roll back", async () => {
  const key = {
    organizationId: f.orgA,
    actorEntityId: f.alice,
    tool: "get_task_discussion" as const,
    requestId: crypto.randomUUID(),
  };
  const turn = {
    turnId: crypto.randomUUID(),
    attempt: 2,
    sessionKey: sessionKeys.routine(crypto.randomUUID()),
    origin: null,
    kind: "interactive" as const,
  };
  const output = { conversationId: crypto.randomUUID() };
  await saveToolReceipt(f.db, key, "parsed input", output, turn);
  expect(await findToolReceipt(f.db, key)).toMatchObject({
    ...key,
    fingerprint: "parsed input",
    result: output,
    turnId: turn.turnId,
    attempt: 2,
  });
  for (const other of [
    { organizationId: f.orgB },
    { actorEntityId: f.bob },
    { tool: "reply" as const },
    { requestId: crypto.randomUUID() },
  ])
    expect(await findToolReceipt(f.db, { ...key, ...other })).toBeUndefined();
  const aborted = { ...key, requestId: crypto.randomUUID() };
  const failure = new Error("Rollback");
  expect(
    await rejection(
      f.db.transaction(async (tx) => {
        await saveToolReceipt(tx, aborted, "parsed input", output, turn);
        throw failure;
      }),
    ),
  ).toBe(failure);
  expect(await findToolReceipt(f.db, aborted)).toBeUndefined();
});
