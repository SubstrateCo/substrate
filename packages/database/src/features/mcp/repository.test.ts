import { sessionKeys } from "@substrate/contracts/agent-work";

import { userAgents } from "../../core/actors/user-agents.schema";
import { registerDevice } from "../../core/devices/repository";
import { AccessDeniedError, ConflictError } from "../../errors";
import { ownedAgent } from "../../testing/agents";
import { setupDatabase } from "../../testing/database";
import { recordQueries } from "../../testing/queries";
import { rejection } from "../../testing/rejection";
import { claimToolReceipt, requireHomeDevice, saveToolReceipt } from "./repository";
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

test("tool receipts are claimed once per actor, tool and request, and roll back", async () => {
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
  const claim = (receipt: Parameters<typeof claimToolReceipt>[1], fingerprint = "parsed input") =>
    claimToolReceipt(f.db, receipt, fingerprint, turn);
  expect(await claim(key)).toBeUndefined();
  await saveToolReceipt(f.db, key, output);
  expect(await claim(key)).toMatchObject({
    ...key,
    fingerprint: "parsed input",
    result: output,
    turnId: turn.turnId,
    attempt: 2,
  });
  expect(await rejection(claim(key, "other input"))).toBeInstanceOf(ConflictError);
  for (const other of [
    { actorEntityId: f.bob },
    { tool: "reply" as const },
    { requestId: crypto.randomUUID() },
  ])
    expect(await claim({ ...key, ...other })).toBeUndefined();
  const aborted = { ...key, requestId: crypto.randomUUID() };
  const failure = new Error("Rollback");
  expect(
    await rejection(
      f.db.transaction(async (tx) => {
        await claimToolReceipt(tx, aborted, "parsed input", turn);
        await saveToolReceipt(tx, aborted, output);
        throw failure;
      }),
    ),
  ).toBe(failure);
  expect(await claim(aborted)).toBeUndefined();
});
