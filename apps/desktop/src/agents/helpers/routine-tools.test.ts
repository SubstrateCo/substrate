import type { HarnessCommand } from "@substrate/contracts/harness";
import type { LocalToolRequest } from "@substrate/contracts/harness/mcp";
import type { LocalToolName } from "@substrate/contracts/harness/tools";

import {
  agentId,
  organizationId,
  runtimeFixture,
  type RuntimeFixture,
} from "../runtime/test-support.ts";
import { afterEach, expect, test } from "bun:test";

type TurnCommand = Extract<HarnessCommand, { type: "turn" }>;

let fixture: RuntimeFixture | undefined;
afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});

async function liveTurn() {
  fixture = await runtimeFixture();
  await fixture.runtime.start();
  await fixture.message();
  const turn = fixture.turns().at(-1)!;
  const f = fixture;
  const call = (
    tool: LocalToolName,
    input: LocalToolRequest["input"],
    context: TurnCommand["context"] = turn.context,
  ) =>
    f.runtime.handleLocalTool({
      tool,
      sessionId: turn.sessionId,
      organizationId,
      agentId,
      input,
      turn: context,
    });
  return { f, turn, call };
}

const daily = { name: "Daily summary", prompt: "Summarize.", cron: "0 9 * * *", timezone: "UTC" };

test("an agent creates, changes and deletes its routines, and they run without approval", async () => {
  const { f, call } = await liveTurn();
  const created = await call("create_routine", daily);
  expect(created).toMatchObject({ success: true, data: { name: "Daily summary", enabled: true } });
  if (!created.success) throw new Error("create_routine failed.");
  // SAFETY: create_routine succeeded, so data is its output.
  const { routineId } = created.data as { routineId: string };

  await f.advance(24 * 60 * 60_000);
  expect(await f.runtime.routines.tick()).toBe(1);
  expect(
    await call("update_routine", { routineId, changes: { cron: "0 10 * * *" } }),
  ).toMatchObject({ success: true, data: { cron: "0 10 * * *" } });
  await f.advance(24 * 60 * 60_000);
  expect(await f.runtime.routines.tick()).toBe(1);

  expect(await call("list_routines", {})).toMatchObject({
    success: true,
    data: { items: [{ routineId, cron: "0 10 * * *" }] },
  });
  expect(await call("delete_routine", { routineId })).toEqual({
    success: true,
    data: { deleted: true },
  });
  expect(await f.runtime.routines.list(agentId)).toEqual([]);
  expect(await call("delete_routine", { routineId })).toMatchObject({
    success: false,
    error: { code: "NOT_FOUND" },
  });
});

test("agents post routines only where their owner can see, and need a valid schedule", async () => {
  const { f, call } = await liveTurn();
  const hidden = { conversationId: crypto.randomUUID(), threadId: null };
  expect(await call("create_routine", { ...daily, destination: hidden })).toMatchObject({
    success: false,
    error: { code: "INVALID_INPUT" },
  });
  const channel = { conversationId: crypto.randomUUID(), threadId: null };
  f.visibleConversations.add(channel.conversationId);
  const created = await call("create_routine", { ...daily, destination: channel });
  expect(created).toMatchObject({ success: true, data: { destination: channel } });
  if (!created.success) throw new Error("create_routine failed.");
  // SAFETY: create_routine succeeded, so data is its output.
  const { routineId } = created.data as { routineId: string };
  expect(
    await call("update_routine", { routineId, changes: { destination: hidden } }),
  ).toMatchObject({ success: false, error: { code: "INVALID_INPUT" } });
  expect((await f.runtime.routines.list(agentId))[0]!.destination).toEqual(channel);
  await f.runtime.routines.delete(routineId);

  expect(await call("create_routine", { ...daily, cron: "61 * * * *" })).toMatchObject({
    success: false,
    error: { code: "INVALID_INPUT", message: "Invalid cron expression." },
  });
  expect(await f.runtime.routines.list(agentId)).toEqual([]);
});

test("background turns change routines, and an agent changes only its own", async () => {
  const { f, turn, call } = await liveTurn();
  const background = { ...turn.context, kind: "unattended" as const };
  expect(await call("create_routine", daily, background)).toMatchObject({ success: true });
  expect(await f.runtime.routines.list(agentId)).toHaveLength(1);

  const other = await f.store.routines.create(
    {
      organizationId,
      userAgentId: crypto.randomUUID(),
      ...daily,
      enabled: true,
      destinationConversationId: crypto.randomUUID(),
      destinationThreadId: null,
    },
    null,
    0,
  );
  expect(await call("delete_routine", { routineId: other.id })).toMatchObject({
    success: false,
    error: { code: "NOT_FOUND" },
  });
  expect(await f.store.routines.get(other.id)).toBeDefined();
});
