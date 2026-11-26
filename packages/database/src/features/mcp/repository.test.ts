import { ConflictError } from "../../errors";
import { setupDatabase } from "../../testing/database";
import { rejection } from "../../testing/rejection";
import { claimToolReceipt, saveToolReceipt } from "./repository";
import { expect, test } from "bun:test";

const f = setupDatabase();

test("tool receipts are claimed once per actor, tool and request, and roll back", async () => {
  const key = {
    organizationId: f.orgA,
    actorEntityId: f.alice,
    tool: "get_task_discussion" as const,
    requestId: crypto.randomUUID(),
  };
  const turn = { turnId: crypto.randomUUID(), attempt: 2 };
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
