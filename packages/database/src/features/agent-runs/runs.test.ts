import { registerDevice } from "../../core/devices/repository";
import { AccessDeniedError, ConflictError, ValidationError } from "../../errors";
import { agentRunRequests, agentRuns, userAgents } from "../../schema";
import { ownedAgent } from "../../testing/agents";
import { setupDatabase } from "../../testing/database";
import { createMessagingService } from "../messaging/service";
import {
  appendEvents,
  claimRuns,
  closeRequest,
  finishRun,
  heartbeat,
  openRequest,
  pendingDeliveries,
  recordSession,
} from "./device";
import { cancelRun, getRun, listConversationRuns, respondToRequest } from "./owner";
import { expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";

/* oxlint-disable typescript/await-thenable -- Bun rejection assertions are asynchronous. */
const f = setupDatabase();

async function directMessage() {
  const agent = await ownedAgent(f);
  const alice = createMessagingService(f.db, { organizationId: f.orgA, userId: "alice" });
  const dm = await alice.createConversation({ kind: "dm", agentIds: [agent.agentId] });
  const owner = { userId: "alice", organizationId: f.orgA };
  return { agent, alice, dm, owner };
}

const approval = {
  type: "approval" as const,
  title: "Allow Bash?",
  detail: "rm -rf build",
  options: [
    { id: "allow", label: "Approve", style: "approve" as const },
    { id: "deny", label: "Decline", style: "deny" as const },
  ],
};

test("the home device claims a run with the rendered trigger prompt; other devices do not", async () => {
  const { agent, alice, dm } = await directMessage();
  const message = await alice.sendMessage(dm.id, "Check the build");
  const laptop = { ...agent.identity, installationId: crypto.randomUUID() };
  await registerDevice(f.db, "alice", { ...laptop, name: "Other", platform: "darwin" });
  expect(await claimRuns(f.db, laptop)).toEqual([]);

  const [claimed, ...rest] = await claimRuns(f.db, agent.identity);
  expect(rest).toEqual([]);
  expect(claimed).toMatchObject({
    agentId: agent.agentId,
    conversationId: dm.id,
    threadId: message.id,
    resumeSessionId: null,
  });
  expect(claimed!.prompt).toContain("Alice sent you a direct message");
  expect(claimed!.prompt).toContain(`Alice (message ${message.id}):\nCheck the build`);
  expect(claimed!.prompt).toContain(`conversationId ${dm.id} and threadId ${message.id}`);
  expect(await claimRuns(f.db, agent.identity)).toEqual([]);
});

test("a custom trigger prompt replaces the default", async () => {
  const { agent, alice, dm } = await directMessage();
  await f.db.execute(
    sql`insert into user_agent_triggers (user_agent_id, kind, prompt) values (${agent.agentId}::uuid, 'direct_message', 'Task from {{authorName}}: {{messages}} {{unknown}}')`,
  );
  const message = await alice.sendMessage(dm.id, "Ship it");
  const [claimed] = await claimRuns(f.db, agent.identity);
  expect(claimed!.prompt).toBe(
    `Task from Alice: Alice (message ${message.id}):\nShip it {{unknown}}`,
  );
});

test("an agent without a home device is adopted by the first desktop that claims", async () => {
  const { agent, alice, dm } = await directMessage();
  await f.db.update(userAgents).set({ homeDeviceId: null });
  await alice.sendMessage(dm.id, "Hello");
  expect(await claimRuns(f.db, agent.identity)).toHaveLength(1);
  const [row] = await f.db.select().from(userAgents).where(eq(userAgents.id, agent.agentId));
  expect(row!.homeDeviceId).toBe(agent.device.id);
});

test("one turn per thread runs at a time, and the next turn resumes the thread's session", async () => {
  const { agent, alice, dm } = await directMessage();
  const root = await alice.sendMessage(dm.id, "Start");
  const [first] = await claimRuns(f.db, agent.identity);
  await recordSession(f.db, agent.identity, first!.id, "local-session-1");
  await alice.sendMessage(dm.id, "More detail", root.id);
  expect(await claimRuns(f.db, agent.identity)).toEqual([]);

  await finishRun(f.db, agent.identity, { runId: first!.id, status: "completed" });
  const [second] = await claimRuns(f.db, agent.identity);
  expect(second).toMatchObject({ threadId: root.id, resumeSessionId: "local-session-1" });
});

test("the first answer to a request wins and the device receives it once", async () => {
  const { agent, alice, dm, owner } = await directMessage();
  await alice.sendMessage(dm.id, "Clean up");
  const [run] = await claimRuns(f.db, agent.identity);
  const request = await openRequest(f.db, agent.identity, {
    runId: run!.id,
    nativeRequestId: "native-1",
    payload: approval,
  });
  expect(
    await openRequest(f.db, agent.identity, {
      runId: run!.id,
      nativeRequestId: "native-1",
      payload: approval,
    }),
  ).toEqual(request);

  await expect(
    respondToRequest(f.db, owner, request.id, { type: "approval", optionId: "sudo" }),
  ).rejects.toBeInstanceOf(ValidationError);
  await respondToRequest(f.db, owner, request.id, { type: "approval", optionId: "deny" });
  await expect(
    respondToRequest(f.db, owner, request.id, { type: "approval", optionId: "allow" }),
  ).rejects.toBeInstanceOf(ConflictError);

  expect(await pendingDeliveries(f.db, agent.identity)).toEqual([
    {
      requestId: request.id,
      runId: run!.id,
      nativeRequestId: "native-1",
      response: { type: "approval", optionId: "deny" },
    },
  ]);
  await closeRequest(f.db, agent.identity, request.id, "delivered");
  expect(await pendingDeliveries(f.db, agent.identity)).toEqual([]);
});

test("requests expire after 10 minutes and close when the run ends", async () => {
  const { agent, alice, dm, owner } = await directMessage();
  await alice.sendMessage(dm.id, "Work");
  const [run] = await claimRuns(f.db, agent.identity);
  const stale = await openRequest(f.db, agent.identity, {
    runId: run!.id,
    nativeRequestId: "old",
    payload: approval,
  });
  await f.db
    .update(agentRunRequests)
    .set({ createdAt: sql`now() - interval '11 minutes'` })
    .where(eq(agentRunRequests.id, stale.id));
  await expect(
    respondToRequest(f.db, owner, stale.id, { type: "approval", optionId: "allow" }),
  ).rejects.toBeInstanceOf(ConflictError);
  expect((await getRun(f.db, owner, run!.id)).requests[0]!.status).toBe("expired");

  const open = await openRequest(f.db, agent.identity, {
    runId: run!.id,
    nativeRequestId: "new",
    payload: approval,
  });
  await finishRun(f.db, agent.identity, { runId: run!.id, status: "completed" });
  const detail = await getRun(f.db, owner, run!.id);
  expect(detail.requests.map((request) => [request.id, request.status])).toEqual([
    [stale.id, "expired"],
    [open.id, "cancelled"],
  ]);
});

test("the owner's cancel reaches the device through its heartbeat", async () => {
  const { agent, alice, dm, owner } = await directMessage();
  await alice.sendMessage(dm.id, "Long task");
  const [run] = await claimRuns(f.db, agent.identity);
  expect(await heartbeat(f.db, agent.identity, [run!.id])).toEqual({
    running: [run!.id],
    cancelled: [],
  });
  await cancelRun(f.db, owner, run!.id);
  expect(await heartbeat(f.db, agent.identity, [run!.id])).toEqual({
    running: [],
    cancelled: [run!.id],
  });
  await finishRun(f.db, agent.identity, { runId: run!.id, status: "completed" });
  expect((await getRun(f.db, owner, run!.id)).status).toBe("cancelled");
  await expect(cancelRun(f.db, owner, run!.id)).rejects.toBeInstanceOf(ConflictError);
});

test("queued runs expire after 24 hours and silent devices lose their runs", async () => {
  const { agent, alice, dm, owner } = await directMessage();
  const waiting = await alice.sendMessage(dm.id, "Later");
  await f.db.update(agentRuns).set({ expiresAt: sql`now() - interval '1 second'` });
  const running = await alice.sendMessage(dm.id, "Now");
  const [claimed] = await claimRuns(f.db, agent.identity);
  expect(claimed!.threadId).toBe(running.id);
  await f.db
    .update(agentRuns)
    .set({ leaseExpiresAt: sql`now() - interval '1 second'` })
    .where(eq(agentRuns.id, claimed!.id));

  const listed = await listConversationRuns(f.db, owner, dm.id);
  expect(listed.map((run) => [run.threadId, run.status])).toEqual([
    [running.id, "failed"],
    [waiting.id, "expired"],
  ]);
  await expect(
    finishRun(f.db, agent.identity, { runId: claimed!.id, status: "completed" }),
  ).rejects.toBeInstanceOf(AccessDeniedError);
});

test("the transcript records events in order and the latest activity", async () => {
  const { agent, alice, dm, owner } = await directMessage();
  await alice.sendMessage(dm.id, "Go");
  const [run] = await claimRuns(f.db, agent.identity);
  await appendEvents(f.db, agent.identity, run!.id, [
    { kind: "activity", text: "Read README.md" },
    { kind: "text", text: "Looking at it." },
  ]);
  await appendEvents(f.db, agent.identity, run!.id, [{ kind: "activity", text: "Ran tests" }]);
  const detail = await getRun(f.db, owner, run!.id);
  expect(detail.activity).toBe("Ran tests");
  expect(detail.events.map((event) => [event.sequence, event.text])).toEqual([
    [1, "Read README.md"],
    [2, "Looking at it."],
    [3, "Ran tests"],
  ]);
});

test("other people cannot see, answer, or act on someone's runs", async () => {
  const { agent, alice, dm } = await directMessage();
  await alice.sendMessage(dm.id, "Private");
  const [run] = await claimRuns(f.db, agent.identity);
  const request = await openRequest(f.db, agent.identity, {
    runId: run!.id,
    nativeRequestId: "n",
    payload: approval,
  });
  const bob = { userId: "bob", organizationId: f.orgA };
  expect(await listConversationRuns(f.db, bob, dm.id)).toEqual([]);
  await expect(getRun(f.db, bob, run!.id)).rejects.toBeInstanceOf(AccessDeniedError);
  await expect(cancelRun(f.db, bob, run!.id)).rejects.toBeInstanceOf(AccessDeniedError);
  await expect(
    respondToRequest(f.db, bob, request.id, { type: "approval", optionId: "allow" }),
  ).rejects.toBeInstanceOf(AccessDeniedError);

  const bobDevice = { userId: "bob", organizationId: f.orgA, installationId: crypto.randomUUID() };
  await expect(claimRuns(f.db, bobDevice)).rejects.toBeInstanceOf(AccessDeniedError);
  await registerDevice(f.db, "bob", { ...bobDevice, name: "Bob", platform: "linux" });
  await expect(
    appendEvents(f.db, bobDevice, run!.id, [{ kind: "text", text: "x" }]),
  ).rejects.toBeInstanceOf(AccessDeniedError);
  await expect(
    claimRuns(f.db, { ...agent.identity, organizationId: f.orgB }),
  ).rejects.toBeInstanceOf(AccessDeniedError);
});
