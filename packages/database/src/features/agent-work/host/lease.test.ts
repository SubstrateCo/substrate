import { interruptionNote } from "@substrate/contracts/agent-work/control";

import { registerDevice } from "../../../core/devices/repository";
import { createRepositories } from "../../../repositories";
import { agentTurns, agentWorkItems, userAgents } from "../../../schema";
import { setupDatabase } from "../../../testing/database";
import { hostFixture } from "../../../testing/host";
import { sweepExpiredLeases } from "./lease";
import { leaseGraceMs, leaseMs } from "./lease-time";
import { expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";

const f = setupDatabase();

async function claimedTurn() {
  const x = await hostFixture(f);
  await x.alice.sendMessage(x.dm.id, "Summarize the week");
  const [claimed] = await x.claim();
  return { ...x, claimed: claimed! };
}

const recoveryItems = (turnId: string) =>
  f.db
    .select()
    .from(agentWorkItems)
    .where(and(eq(agentWorkItems.source, "recovery")))
    .then((rows) =>
      rows.filter((row) => row.sourceRef.source === "recovery" && row.sourceRef.turnId === turnId),
    );

test("an expired lease of a homed agent waits for its host for ten minutes", async () => {
  const x = await claimedTurn();
  const expired = new Date(Date.now() + leaseMs + 60_000);
  expect(await x.run((tx) => sweepExpiredLeases(tx, expired))).toBe(0);
  expect((await x.turnRow(x.claimed.turn.id)).status).toBe("assigned");
});

test("a turn that never started puts its batch back when its lease is gone for good", async () => {
  const x = await claimedTurn();
  const gone = new Date(Date.now() + leaseMs + leaseGraceMs + 60_000);
  expect(await x.run((tx) => sweepExpiredLeases(tx, gone))).toBe(1);
  expect(await x.turnRow(x.claimed.turn.id)).toMatchObject({
    status: "cancelled",
    leaseDeviceId: null,
  });
  expect((await x.items()).map((item) => [item.status, item.turnId])).toEqual([["pending", null]]);
  expect(await x.claim({}, new Date(gone.getTime() + 1_000))).toHaveLength(1);
});

test("a started turn whose host is gone ends interrupted and resumes in the next turn", async () => {
  const x = await claimedTurn();
  await f.db
    .update(agentTurns)
    .set({ status: "running", startedAt: new Date() })
    .where(eq(agentTurns.id, x.claimed.turn.id));
  const gone = new Date(Date.now() + leaseMs + leaseGraceMs + 60_000);
  await x.run((tx) => sweepExpiredLeases(tx, gone));
  expect(await x.turnRow(x.claimed.turn.id)).toMatchObject({
    status: "interrupted",
    interruption: "app",
  });
  expect((await x.items()).filter((item) => item.source === "owner_message")[0]!.status).toBe(
    "consumed",
  );
  expect((await recoveryItems(x.claimed.turn.id)).map((item) => item.body)).toEqual([
    interruptionNote("app"),
  ]);
});

test("a lost turn with an unconfirmed steered item needs the owner", async () => {
  const x = await claimedTurn();
  await f.db
    .update(agentTurns)
    .set({ status: "running", startedAt: new Date() })
    .where(eq(agentTurns.id, x.claimed.turn.id));
  const session = await x.session({ key: x.claimed.session.key, kind: "dm" });
  const steered = await x.item(session, {
    source: "owner_message",
    messageId: crypto.randomUUID(),
    conversationId: x.dm.id,
    threadId: null,
  });
  await f.db
    .update(agentWorkItems)
    .set({ status: "submitted", steered: true, turnId: x.claimed.turn.id })
    .where(eq(agentWorkItems.id, steered.id));
  await x.run((tx) =>
    sweepExpiredLeases(tx, new Date(Date.now() + leaseMs + leaseGraceMs + 60_000)),
  );
  expect(await x.turnRow(x.claimed.turn.id)).toMatchObject({
    status: "needs_attention",
    attentionReason: "uncertain_input",
  });
  expect((await x.itemRow(steered.id)).status).toBe("uncertain");
});

test("moving the agent ends its live turns on the old device at once", async () => {
  const x = await claimedTurn();
  await f.db
    .update(agentTurns)
    .set({ status: "running", startedAt: new Date() })
    .where(eq(agentTurns.id, x.claimed.turn.id));
  const installationId = crypto.randomUUID();
  await registerDevice(f.db, "alice", { installationId, name: "Desktop", platform: "linux" });
  const owner = await createRepositories(f.db).forOwnerSession({ userId: "alice", installationId });
  const moved = await owner.agents.setHomeDevice(x.agent.agentId);
  expect(moved.hints).toContainEqual({ audience: ["user", "alice"], domain: "agent-work" });
  expect(await x.turnRow(x.claimed.turn.id)).toMatchObject({
    status: "interrupted",
    interruption: "moved",
    leaseDeviceId: null,
  });
  expect((await recoveryItems(x.claimed.turn.id)).map((item) => item.body)).toEqual([
    interruptionNote("moved"),
  ]);
  const [agent] = await f.db.select().from(userAgents).where(eq(userAgents.id, x.agent.agentId));
  expect(await x.claim()).toEqual([]);
  expect(
    await x.claim({}, undefined, { ...x.identity, installationId, deviceId: agent!.homeDeviceId! }),
  ).toHaveLength(1);
});

test("an expired lease after a move ends even within the grace period", async () => {
  const x = await claimedTurn();
  const desktop = await registerDevice(f.db, "alice", {
    installationId: crypto.randomUUID(),
    name: "Desktop",
    platform: "linux",
  });
  await f.db
    .update(userAgents)
    .set({ homeDeviceId: desktop.id })
    .where(eq(userAgents.id, x.agent.agentId));
  expect(await x.run((tx) => sweepExpiredLeases(tx, new Date(Date.now() + leaseMs + 60_000)))).toBe(
    1,
  );
  expect((await x.turnRow(x.claimed.turn.id)).status).toBe("cancelled");
});

test("a heartbeat renews the leases of the device's live turns", async () => {
  const x = await claimedTurn();
  await f.db
    .update(agentTurns)
    .set({ leaseExpiresAt: new Date(Date.now() - 1_000) })
    .where(eq(agentTurns.id, x.claimed.turn.id));
  const owner = await createRepositories(f.db).forOwnerSession(x.agent.identity);
  await owner.devices.touch(x.agent.identity.installationId);
  const { leaseExpiresAt } = await x.turnRow(x.claimed.turn.id);
  expect(leaseExpiresAt!.getTime()).toBeGreaterThan(Date.now() + leaseMs - 10_000);
});
