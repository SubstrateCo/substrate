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

test("an agent creates, changes and deletes its routines, and changes wait for approval", async () => {
  const { f, call } = await liveTurn();
  const created = await call("create_routine", daily);
  expect(created).toMatchObject({
    success: true,
    data: { name: "Daily summary", enabled: true, approved: false, nextFireAt: null },
  });
  if (!created.success) throw new Error("create_routine failed.");
  // SAFETY: create_routine succeeded, so data is its output.
  const { routineId } = created.data as { routineId: string };

  // The owner approves; a new schedule needs approval again, and pausing does not.
  const [row] = await f.runtime.routines.list(agentId);
  await f.runtime.routines.approve({ routineId, revision: row!.revision });
  expect(await call("update_routine", { routineId, changes: { enabled: false } })).toMatchObject({
    success: true,
    data: { enabled: false, approved: true },
  });
  expect(
    await call("update_routine", { routineId, changes: { cron: "0 10 * * *" } }),
  ).toMatchObject({ success: true, data: { cron: "0 10 * * *", approved: false } });

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

test("agents cannot choose where a routine posts, and need a valid schedule", async () => {
  const { f, call } = await liveTurn();
  // The owner's approval list does not show a destination, so the agent cannot set one.
  expect(
    await call("create_routine", {
      ...daily,
      destination: { conversationId: crypto.randomUUID(), threadId: null },
    }),
  ).toMatchObject({ success: false, error: { code: "INVALID_INPUT" } });
  expect(await call("create_routine", { ...daily, cron: "61 * * * *" })).toMatchObject({
    success: false,
    error: { code: "INVALID_INPUT", message: "Invalid cron expression." },
  });
  expect(await f.runtime.routines.list(agentId)).toEqual([]);
});

test("background turns cannot change routines, and an agent changes only its own", async () => {
  const { f, turn, call } = await liveTurn();
  const background = { ...turn.context, kind: "unattended" as const };
  expect(await call("create_routine", daily, background)).toMatchObject({
    success: false,
    error: { code: "FORBIDDEN" },
  });
  expect(await f.runtime.routines.list(agentId)).toEqual([]);

  const other = await f.store.routines.create(
    {
      organizationId,
      userAgentId: crypto.randomUUID(),
      ...daily,
      enabled: true,
      destinationConversationId: crypto.randomUUID(),
      destinationThreadId: null,
    },
    0,
  );
  expect(await call("delete_routine", { routineId: other.id })).toMatchObject({
    success: false,
    error: { code: "NOT_FOUND" },
  });
  expect(await f.store.routines.get(other.id)).toBeDefined();
});
