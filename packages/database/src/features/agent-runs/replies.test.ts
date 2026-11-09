import type { McpInput } from "@startup-os/contracts/harness/tools";

import { ownedAgent } from "../../testing/agents";
import { setupDatabase } from "../../testing/database";
import { executeAgentTool } from "../mcp/service";
import { createMessagingService } from "../messaging/service";
import { claimRuns, finishRun } from "./device";
import { getRun, listConversationRuns } from "./owner";
import { expect, test } from "bun:test";

const f = setupDatabase();

async function runningThread() {
  const agent = await ownedAgent(f);
  const alice = createMessagingService(f.db, { organizationId: f.orgA, userId: "alice" });
  const dm = await alice.createConversation({ kind: "dm", agentIds: [agent.agentId] });
  const root = await alice.sendMessage(dm.id, "Summarize churn");
  const [run] = await claimRuns(f.db, agent.identity);
  const owner = { userId: "alice", organizationId: f.orgA };
  const send = async (body: string, threadId?: string) => {
    const input: McpInput<"send_message"> = {
      requestId: crypto.randomUUID(),
      conversationId: dm.id,
      body,
    };
    if (threadId) input.threadId = threadId;
    const { output } = await executeAgentTool(
      f.db,
      { organizationId: f.orgA, userId: "alice", actorEntityId: agent.actorId },
      "send_message",
      input,
    );
    return output.id;
  };
  return { agent, alice, dm, root, run: run!, owner, send };
}

test("messages the agent sends in the run's thread while it runs belong to that run", async () => {
  const { root, run, owner, send } = await runningThread();
  const first = await send("Looking now", root.id);
  const second = await send("42 accounts churned", root.id);
  expect((await getRun(f.db, owner, run.id)).replyMessageIds).toEqual([first, second]);
});

test("messages outside the thread or after the run ends stay unlinked", async () => {
  const { agent, dm, root, run, owner, send } = await runningThread();
  await send("Top-level note");
  const elsewhere = await createMessagingService(f.db, {
    organizationId: f.orgA,
    userId: "alice",
  }).sendMessage(dm.id, "Another topic");
  await send("Wrong thread", elsewhere.id);
  await finishRun(f.db, agent.identity, { runId: run.id, status: "completed" });
  await send("Late follow-up", root.id);

  const runs = await listConversationRuns(f.db, owner, dm.id);
  expect(runs.find((item) => item.id === run.id)!.replyMessageIds).toEqual([]);
  expect(runs.flatMap((item) => item.replyMessageIds)).toEqual([]);
});
