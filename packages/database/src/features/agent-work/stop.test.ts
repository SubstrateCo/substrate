import { sessionKeys } from "@substrate/contracts/agent-work";

import { agentRoutines, userAgents } from "../../schema";
import { hostWork } from "../../testing/agent-work";
import { setupDatabase } from "../../testing/database";
import { hostFixture } from "../../testing/host";
import { createAgentRepository } from "../agents/repository";
import { createRoutine } from "./routines/routines";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

const f = setupDatabase();

/** Alice's agent with a claimed DM turn. */
async function claimedTurn() {
  const x = await hostFixture(f);
  await x.alice.sendMessage(x.dm.id, "Start");
  const [claimed] = await x.claim();
  const host = await hostWork(f.db, x.agent.identity);
  const start = () => host.start(claimed!.turn.id, { attempt: 1, droppedItemIds: [] });
  const agents = <T>(work: (repository: ReturnType<typeof createAgentRepository>) => Promise<T>) =>
    x.run((tx) => work(createAgentRepository(tx, "alice")));
  const disable = async () => {
    const [row] = await f.db.select().from(userAgents).where(eq(userAgents.id, x.agent.agentId));
    await agents((repository) =>
      repository.saveAgent({
        id: row!.id,
        name: row!.name,
        instructions: row!.instructions,
        harness: row!.harness,
        enabled: false,
        disabledApps: row!.disabledApps,
        substrateGuide: row!.substrateGuide,
      }),
    );
  };
  return { ...x, claimed: claimed!, start, agents, disable };
}

test("disabling the agent stops its running turn", async () => {
  const x = await claimedTurn();
  await x.start();
  await x.disable();
  expect(await x.turnRow(x.claimed.turn.id)).toMatchObject({
    status: "stopping",
    interruption: "stop",
  });
});

test("disabling the agent puts a turn that never started back; its work waits", async () => {
  const x = await claimedTurn();
  await x.disable();
  expect((await x.turnRow(x.claimed.turn.id)).status).toBe("cancelled");
  const [item] = await x.items();
  expect(item).toMatchObject({ status: "pending", turnId: null });
  // A disabled agent is not claimed.
  expect(await x.claim()).toEqual([]);
});

test("deleting the agent ends its work: queued items drop and its routines stop", async () => {
  const x = await claimedTurn();
  await x.start();
  const routine = await x.run((tx) =>
    createRoutine(
      tx,
      x.owner,
      x.agent.agentId,
      {
        name: "Digest",
        prompt: "Summarize.",
        cron: "0 9 * * *",
        timezone: "UTC",
        enabled: true,
        destination: null,
      },
      "owner",
    ),
  );
  const session = await x.session({ key: sessionKeys.routine(routine.id), kind: "routine" });
  const queued = await x.item(session, {
    source: "routine",
    routineId: routine.id,
    revision: 1,
    scheduledAt: new Date().toISOString(),
  });
  await x.agents((repository) => repository.deleteAgent(x.agent.agentId));
  expect((await x.turnRow(x.claimed.turn.id)).status).toBe("stopping");
  expect(await x.itemRow(queued.id)).toMatchObject({ status: "dropped", reason: "agent_deleted" });
  const [stored] = await f.db.select().from(agentRoutines).where(eq(agentRoutines.id, routine.id));
  expect(stored!.enabled).toBe(false);
});
