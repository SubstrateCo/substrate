import { sessionKeys } from "@substrate/contracts/agent-work";

import { AccessDeniedError } from "../../errors";
import { ownedAgent } from "../../testing/agents";
import { setupDatabase } from "../../testing/database";
import { rejection } from "../../testing/rejection";
import { findToolReceipt, requireHomeDevice, saveToolReceipt } from "./repository";
import { expect, test } from "bun:test";

const f = setupDatabase();

test("home-device access binds the actor, owner and registered installation", async () => {
  const agent = await ownedAgent(f);
  const identity = { userId: "alice", organizationId: f.orgA };
  expect(
    await f.db.transaction((tx) =>
      requireHomeDevice(tx, identity, agent.actorId, agent.identity.installationId),
    ),
  ).toBe(agent.agentId);
  for (const [owner, installation] of [
    [identity, undefined],
    [identity, crypto.randomUUID()],
    [{ ...identity, userId: "bob" }, agent.identity.installationId],
  ] as const) {
    expect(
      await rejection(
        f.db.transaction((tx) => requireHomeDevice(tx, owner, agent.actorId, installation)),
      ),
    ).toBeInstanceOf(AccessDeniedError);
  }
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
