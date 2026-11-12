import { registerDevice } from "../../core/devices/repository";
import { AccessDeniedError } from "../../errors";
import { createRepositories } from "../../repositories";
import { agentInvocations, user, userAgents } from "../../schema";
import { agentWorkFixture, callerFixture } from "../../testing/agent-work";
import { setupDatabase } from "../../testing/database";
import { recordQueries } from "../../testing/queries";
import { rejection } from "../../testing/rejection";
import { createMessagingService } from "../messaging/service";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

const f = setupDatabase();

test("source pages join current human and agent names without per-message lookups", async () => {
  const { agent, alice, dm } = await agentWorkFixture(f);
  const ownerMessage = await alice.sendMessage(dm.id, "Owner text");
  const agentMessage = await createMessagingService(f.db, {
    userId: "alice",
    organizationId: f.orgA,
    actorEntityId: agent.actorId,
  }).sendMessage(dm.id, "Agent text");
  await f.db.update(user).set({ name: "Alice renamed" }).where(eq(user.id, "alice"));
  await f.db
    .update(userAgents)
    .set({ name: "Scout renamed" })
    .where(eq(userAgents.id, agent.agentId));
  const { db, queries } = recordQueries();
  const device = await createRepositories(db).forDeviceSession(agent.identity);
  queries.length = 0;
  const { result } = await device.agentWork.loadSources([ownerMessage.id, agentMessage.id]);
  expect(result.messages.find((message) => message.id === ownerMessage.id)?.author).toMatchObject({
    name: "Alice renamed",
    kind: "owner",
  });
  expect(result.messages.find((message) => message.id === agentMessage.id)?.author).toMatchObject({
    name: "Scout renamed",
    kind: "agent",
  });
  expect(queries.filter((query) => query.startsWith("select"))).toHaveLength(1);
  expect(queries.join("\n")).not.toMatch(/dn_user|dn_agent/);
});

test("native polling resolves membership and registration once at its factory boundary", async () => {
  await f.verifyEmails();
  const identity = { userId: "alice", organizationId: f.orgA, installationId: crypto.randomUUID() };
  await registerDevice(f.db, identity.userId, { ...identity, name: "Desktop", platform: "test" });
  const { db, queries } = recordQueries();
  const device = await createRepositories(db).forDeviceSession(identity);
  expect(await device.agentWork.requestAnswers()).toEqual([]);
  expect((await device.agentWork.ackWakes([])).result).toEqual({ acked: 0 });
  expect((await device.agentWork.loadSources([], [])).result.messages).toEqual([]);
  expect(queries.filter((query) => query.includes('from "user"'))).toHaveLength(1);
  expect(queries.filter((query) => query.includes('from "desktop_devices"'))).toHaveLength(1);
});

test("resolved device work keeps home checks, wake CAS, committed hints and current source access", async () => {
  const { agent, alice, dm } = await agentWorkFixture(f);
  const sent = await alice.sendMessage(dm.id, "Wake the home desktop");
  const repositories = createRepositories(f.db);
  const home = await repositories.forDeviceSession(agent.identity);
  const installationId = crypto.randomUUID();
  await registerDevice(f.db, "alice", { installationId, name: "Other", platform: "test" });
  const other = await repositories.forDeviceSession({ ...agent.identity, installationId });
  const status = { userAgentId: agent.agentId, state: "idle" as const, queuedCount: 0, version: 1 };
  expect(await rejection(other.agentWork.publishStatus(status))).toBeInstanceOf(AccessDeniedError);
  const published = await home.agentWork.publishStatus(status);
  expect(published.result).toEqual({ applied: true, changed: true });
  expect(published.hints).toHaveLength(1);
  expect((await other.agentWork.pullWakes(10)).result).toEqual([]);
  const wakes = (await home.agentWork.pullWakes(10)).result;
  expect(wakes).toHaveLength(1);
  expect((await home.agentWork.ackWakes(wakes.map((wake) => wake.id))).result).toEqual({
    acked: 1,
  });
  expect((await home.agentWork.ackWakes(wakes.map((wake) => wake.id))).result).toEqual({
    acked: 0,
  });
  expect(
    (await home.agentWork.loadSources([sent.id])).result.messages.map((message) => message.body),
  ).toEqual(["Wake the home desktop"]);
  await alice.deleteMessage(sent.id);
  expect((await home.agentWork.loadSources([sent.id])).result).toEqual({
    messages: [],
    inaccessible: [sent.id],
  });
});

test("device sessions reject unverified users, nonmembers and another owner's installation", async () => {
  const installationId = crypto.randomUUID();
  await registerDevice(f.db, "alice", { installationId, name: "Desktop", platform: "test" });
  const repositories = createRepositories(f.db);
  const identity = { userId: "alice", organizationId: f.orgA, installationId };
  expect(await rejection(repositories.forDeviceSession(identity))).toBeInstanceOf(
    AccessDeniedError,
  );
  await f.verifyEmails();
  expect(
    await rejection(repositories.forDeviceSession({ ...identity, organizationId: f.orgB })),
  ).toBeInstanceOf(AccessDeniedError);
  expect(
    await rejection(repositories.forDeviceSession({ ...identity, userId: "bob" })),
  ).toBeInstanceOf(AccessDeniedError);
});

test("resolved device sources recheck caller policy and commit revocation with its hints", async () => {
  const { agent, bob, channel, policy, mention } = await callerFixture(f);
  await policy("anyone");
  const sent = await bob.sendMessage(channel.id, `${mention} help`);
  const [invocation] = await f.db
    .select()
    .from(agentInvocations)
    .where(eq(agentInvocations.messageId, sent.id));
  const device = await createRepositories(f.db).forDeviceSession(agent.identity);
  await policy("owner");
  const result = await device.agentWork.loadSources([sent.id], [invocation!.id]);
  expect(result.result).toEqual({
    messages: [],
    inaccessible: [sent.id],
    inaccessibleInvocations: [invocation!.id],
  });
  expect(result.hints.length).toBeGreaterThan(0);
  const [dropped] = await f.db
    .select()
    .from(agentInvocations)
    .where(eq(agentInvocations.id, invocation!.id));
  expect(dropped).toMatchObject({ status: "dropped", dropReason: "revoked" });
});
