import type { WorkspaceApiRequest } from "@substrate/contracts/agent-tools/mcp";
import type { McpOutput, ServerToolName } from "@substrate/contracts/agent-tools/tools";

import { ValidationError } from "../../errors";
import { agentHelpers } from "../../schema";
import { hostWork } from "../../testing/agent-work";
import { setupDatabase } from "../../testing/database";
import { hostFixture } from "../../testing/host";
import { rejection } from "../../testing/rejection";
import { routineTurn } from "../../testing/turns";
import { executeAgentTool } from "./execution";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

const f = setupDatabase();

async function liveAgent() {
  const x = await hostFixture(f);
  const host = await hostWork(f.db, x.agent.identity);
  const caller = { ...x.agentIdentity, installationId: x.agent.identity.installationId };
  const call = async <K extends ServerToolName>(
    tool: K,
    input: WorkspaceApiRequest["input"],
    turn: { turnId: string; attempt: number },
  ) => {
    const { result } = await executeAgentTool(f.db, caller, tool, input, turn);
    if ("pending" in result) throw new Error(`${tool} waits for approval`);
    // SAFETY: execution parses its payload with the output schema registered for K.
    return result.output as McpOutput<K>;
  };
  const next = async () => {
    const [claimed] = await x.claim();
    if (!claimed) throw new Error("Nothing to claim.");
    await host.start(claimed.turn.id, { attempt: 1, droppedItemIds: [] });
    return { claimed, context: { turnId: claimed.turn.id, attempt: 1 } };
  };
  await x.alice.sendMessage(x.dm.id, "Research this in the background");
  const main = await next();
  const start = (task = "Find the numbers", requestId: string = crypto.randomUUID()) =>
    call("start_helper", { requestId, task }, main.context);
  return { ...x, host, call, next, main, start };
}

test("a helper starts once per request ID, in its own session, with its task as the first item", async () => {
  const x = await liveAgent();
  const requestId = crypto.randomUUID();
  const started = await x.start("Find the numbers", requestId);
  expect(started.status).toBe("running");
  expect((await x.start("Find the numbers", requestId)).helperId).toBe(started.helperId);
  const helper = await x.next();
  expect(helper.claimed.session).toMatchObject({
    kind: "helper",
    helperId: started.helperId,
    parentSessionId: x.main.claimed.session.id,
  });
  expect(helper.claimed.turn.kind).toBe("unattended");
  expect(helper.claimed.items.map((item) => [item.source, item.body])).toEqual([
    ["helper_task", "Find the numbers"],
  ]);
  const listed = await x.call("list_helpers", {}, x.main.context);
  expect(listed.items.map((item) => [item.helperId, item.status])).toEqual([
    [started.helperId, "running"],
  ]);
});

test("at most two helpers run per agent, and helpers cannot start helpers", async () => {
  const x = await liveAgent();
  await x.start("One");
  await x.start("Two");
  const third = await rejection(x.start("Three"));
  expect(third).toBeInstanceOf(ValidationError);
  expect(third.message).toContain("At most 2 helpers");
  const helper = await x.next();
  expect(
    await rejection(
      x.call("start_helper", { requestId: crypto.randomUUID(), task: "Nested" }, helper.context),
    ),
  ).toBeInstanceOf(ValidationError);
});

test("only a helper's turn finishes it; its report reaches the parent session as an item", async () => {
  const x = await liveAgent();
  const started = await x.start();
  expect(
    await rejection(x.call("finish_helper", { report: "Too early" }, x.main.context)),
  ).toBeInstanceOf(ValidationError);
  const helper = await x.next();
  expect(await x.call("finish_helper", { report: "42 units" }, helper.context)).toEqual({
    saved: true,
  });
  const [row] = await f.db.select().from(agentHelpers).where(eq(agentHelpers.id, started.helperId));
  expect(row).toMatchObject({ status: "finished", report: "42 units" });
  const result = (await x.items()).filter((item) => item.source === "helper_result");
  expect(result.map((item) => [item.sessionId, item.body, item.status])).toEqual([
    [x.main.claimed.session.id, "42 units", "pending"],
  ]);
});

test("a parent's message queues in the helper's session; stopping the helper stops its turn", async () => {
  const x = await liveAgent();
  const started = await x.start();
  const helper = await x.next();
  expect(
    await x.call(
      "message_helper",
      { helperId: started.helperId, text: "Also check March" },
      x.main.context,
    ),
  ).toEqual({ delivered: "queued" });
  const queued = (await x.items()).filter(
    (item) => item.sessionId === helper.claimed.session.id && item.status === "pending",
  );
  expect(queued.map((item) => [item.source, item.body])).toEqual([
    ["helper_task", "Also check March"],
  ]);
  expect(await x.call("stop_helper", { helperId: started.helperId }, x.main.context)).toEqual({
    helperId: started.helperId,
    status: "stopped",
  });
  expect(await x.turnRow(helper.context.turnId)).toMatchObject({
    status: "stopping",
    interruption: "stop",
  });
  expect((await x.itemRow(queued[0]!.id)).status).toBe("dropped");
  expect(
    await rejection(
      x.call("message_helper", { helperId: started.helperId, text: "More" }, x.main.context),
    ),
  ).toBeInstanceOf(ValidationError);
});

test("routines change only in interactive turns, and the agent's routines wait for the owner", async () => {
  const x = await liveAgent();
  const created = await x.call(
    "create_routine",
    { name: "Digest", prompt: "Summarize.", cron: "0 9 * * 1-5", timezone: "UTC" },
    x.main.context,
  );
  expect(created).toMatchObject({
    approved: false,
    enabled: true,
    destination: { conversationId: x.dm.id, threadId: null },
  });
  expect((await x.call("list_routines", {}, x.main.context)).items).toEqual([created]);
  const background = await x.turn(routineTurn({ conversationId: x.dm.id, threadId: null }));
  expect((await x.call("list_routines", {}, background)).items).toHaveLength(1);
  const refused = await rejection(
    x.call("delete_routine", { routineId: created.routineId }, background),
  );
  expect(refused).toBeInstanceOf(ValidationError);
  expect(refused.message).toContain("interactive turn");
  expect(await x.call("delete_routine", { routineId: created.routineId }, x.main.context)).toEqual({
    deleted: true,
  });
});

test("a background turn manages helpers without waiting for approval", async () => {
  const x = await liveAgent();
  const background = await x.turn(routineTurn({ conversationId: x.dm.id, threadId: null }));
  const started = await x.call(
    "start_helper",
    { requestId: crypto.randomUUID(), task: "Look it up" },
    background,
  );
  expect(started.status).toBe("running");
  expect(await x.call("stop_helper", { helperId: started.helperId }, background)).toMatchObject({
    status: "stopped",
  });
});
