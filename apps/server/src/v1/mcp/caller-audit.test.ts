import { sessionKeys } from "@substrate/contracts/agent-work";
import { AccessDeniedError, ValidationError } from "@substrate/database/mcp";
import type { DatabaseExecutor } from "@substrate/database/trusted";

import {
  agentAuditEvents,
  agentInvocations,
  agentWakes,
} from "../../../../../packages/database/src/schema";
import {
  ownerAgentWork,
  threadTurn,
} from "../../../../../packages/database/src/testing/agent-work";
import { setupDatabase } from "../../../../../packages/database/src/testing/database";
import { rejection } from "../../../../../packages/database/src/testing/rejection";
import { createCommittedPublisher } from "../../shared/committed";
import { scopeFixture } from "../../test-support";
import { executeAgentTool } from "./execution";
import { createMcpService } from "./service";
import { callerFixture } from "./test-support";
import { expect, test } from "bun:test";
import { asc, eq } from "drizzle-orm";
import { ZodError } from "zod";

const f = setupDatabase();
const calls = () => f.db.select().from(agentInvocations).orderBy(asc(agentInvocations.createdAt));
const callerWakes = () =>
  f.db
    .select()
    .from(agentWakes)
    .where(eq(agentWakes.source, "caller_message"))
    .orderBy(asc(agentWakes.createdAt));

test("a failed failure-audit write cannot hide the original input error", async () => {
  const x = await callerFixture(f);
  await x.policy("anyone");
  const root = await x.bob.sendMessage(x.channel.id, `${x.mention} help`);
  const [call] = await calls();
  let attemptedAudit = false;
  const db = new Proxy(f.db, {
    get(target, property: keyof DatabaseExecutor) {
      if (property === "select")
        return () => {
          attemptedAudit = true;
          throw new Error("Audit unavailable");
        };
      return target[property];
    },
  });
  const error = await rejection(
    executeAgentTool(
      db,
      x.agentIdentity,
      "get_task",
      {},
      {
        ...threadTurn(x.channel.id, root.id),
        invocationIds: [call!.id],
        installationId: x.agent.identity.installationId,
      },
    ),
  );
  expect(error).toBeInstanceOf(ZodError);
  expect(attemptedAudit).toBe(true);
});

test("publisher failure happens after commit and does not audit a failed tool execution", async () => {
  const x = await callerFixture(f);
  await x.policy("anyone");
  const root = await x.bob.sendMessage(x.channel.id, `${x.mention} help`);
  const [call] = await f.db.select().from(agentInvocations);
  const turn = {
    ...threadTurn(x.channel.id, root.id),
    invocationIds: [call!.id],
    installationId: x.agent.identity.installationId,
  };
  let published = false;
  const service = createMcpService({
    db: f.db,
    publish: createCommittedPublisher({
      publish: async () => {
        // This uses a separate connection, so an uncommitted success audit is not visible.
        const committed = await f.db
          .select()
          .from(agentAuditEvents)
          .where(eq(agentAuditEvents.action, "mcp_call"));
        expect(committed.map((row) => row.result)).toEqual(["ok"]);
        published = true;
        throw new Error("Publisher unavailable");
      },
      sharingMail: { trigger: () => {} },
    }),
  });
  expect(
    await service.callAgentTool(
      { ...scopeFixture(), userId: "alice", organizationId: f.orgA },
      {
        organizationId: f.orgA,
        agentId: x.agent.agentId,
        tool: "reply",
        input: { requestId: crypto.randomUUID(), body: "Done" },
        turn,
      },
    ),
  ).toMatchObject({ success: false });
  expect(published).toBe(true);
  const logged = await f.db
    .select()
    .from(agentAuditEvents)
    .where(eq(agentAuditEvents.action, "mcp_call"));
  expect(logged.map((row) => row.result)).toEqual(["ok"]);
});

test("human follow-ups call a participant under each caller's current policy", async () => {
  const x = await callerFixture(f);
  await x.policy("anyone");
  const root = await x.bob.sendMessage(x.channel.id, `${x.mention} start`);
  const [first] = await calls();
  await x.call(
    "reply",
    { requestId: crypto.randomUUID(), body: "Started" },
    { ...threadTurn(x.channel.id, root.id), invocationIds: [first!.id] },
  );
  const carol = await x.carol.sendMessage(x.channel.id, "me too", root.id);
  const bob = await x.bob.sendMessage(x.channel.id, "and the risks", root.id);
  expect((await calls()).map((row) => [row.callerUserId, row.kind, row.messageId])).toEqual([
    ["bob", "mention", root.id],
    ["carol", "thread_reply", carol.id],
    ["bob", "thread_reply", bob.id],
  ]);
  expect((await callerWakes()).map((wake) => wake.sessionKey)).toEqual([
    sessionKeys.thread(root.id),
    sessionKeys.thread(root.id),
    sessionKeys.thread(root.id),
  ]);
});

test("admitted participation permits follow-ups even before a public answer", async () => {
  const x = await callerFixture(f);
  await x.policy("anyone");
  const root = await x.bob.sendMessage(x.channel.id, `${x.mention} start`);
  const [first] = await calls();
  const turn = { ...threadTurn(x.channel.id, root.id), invocationIds: [first!.id] };
  const project = await f.forActor(f.alice).projects.create({ name: "Work" });
  await x.call(
    "propose",
    {
      requestId: crypto.randomUUID(),
      summary: "Track it",
      action: { type: "create_task", input: { projectId: project.entityId, title: "Track" } },
    },
    turn,
  );
  await x.alice.sendMessage(x.channel.id, `${x.mention} note this`, root.id);
  await x.call(
    "reply",
    { requestId: crypto.randomUUID(), body: "Noted" },
    threadTurn(x.channel.id, root.id),
  );
  const followUp = await x.bob.sendMessage(x.channel.id, "and the risks", root.id);
  expect((await calls()).map((row) => row.messageId)).toEqual([root.id, followUp.id]);
  expect(await callerWakes()).toHaveLength(2);
});

test("a caller sees a call as queued until the agent's reply for it is published", async () => {
  const x = await callerFixture(f);
  await x.policy("anyone");
  const root = await x.bob.sendMessage(x.channel.id, `${x.mention} help`);
  const call = (await calls())[0]!;
  const bobWork = await ownerAgentWork(f.db, { userId: "bob", organizationId: f.orgA });
  const bobCalls = () => bobWork.listMyCalls(x.channel.id);
  expect((await bobCalls()).map((view) => view.status)).toEqual(["queued"]);
  await x.call(
    "reply",
    { requestId: crypto.randomUUID(), body: "For Alice" },
    threadTurn(x.channel.id, root.id),
  );
  expect((await bobCalls()).map((view) => view.status)).toEqual(["queued"]);
  await x.call(
    "reply",
    { requestId: crypto.randomUUID(), body: "Done" },
    { ...threadTurn(x.channel.id, root.id), invocationIds: [call.id] },
  );
  expect((await bobCalls()).map((view) => view.status)).toEqual(["answered"]);
});

test("caller tools audit success and failures after rollback without storing message text", async () => {
  const x = await callerFixture(f);
  await x.policy("anyone");
  const root = await x.bob.sendMessage(x.channel.id, `${x.mention} help`);
  const [call] = await f.db.select().from(agentInvocations);
  const turn = { ...threadTurn(x.channel.id, root.id), invocationIds: [call!.id] };
  const replied = await x.call("reply", { requestId: crypto.randomUUID(), body: "Done" }, turn);
  const logs = () =>
    f.db
      .select()
      .from(agentAuditEvents)
      .where(eq(agentAuditEvents.action, "mcp_call"))
      .orderBy(asc(agentAuditEvents.createdAt));
  expect((await logs())[0]).toMatchObject({
    invocationId: call!.id,
    callerUserId: "bob",
    tool: "reply",
    access: "write",
    result: "ok",
    turnId: turn.turnId,
    targetIds: expect.arrayContaining([replied.messageId, x.channel.id]),
  });
  const other = await x.alice.createConversation({ kind: "channel", name: "other" });
  expect(
    await rejection(
      executeAgentTool(
        f.db,
        x.agentIdentity,
        "list_projects",
        {},
        {
          ...threadTurn(other.id, root.id),
          invocationIds: [call!.id],
          installationId: x.agent.identity.installationId,
        },
      ),
    ),
  ).toBeInstanceOf(ValidationError);
  // Input parsing happens before the tool transaction, but must still leave a failure audit.
  expect(await rejection(x.call("get_task", {}, turn))).toBeInstanceOf(Error);
  expect((await logs()).map(({ result, access }) => ({ result, access }))).toEqual([
    { result: "ok", access: "write" },
    { result: "invalid", access: "read" },
    { result: "error", access: "read" },
  ]);
  const log = await (await ownerAgentWork(f.db, x.owner)).listCallsLog(x.agent.agentId);
  expect(JSON.stringify(log)).not.toContain("Done");
  const bobWork = await ownerAgentWork(f.db, { userId: "bob", organizationId: f.orgA });
  expect(await rejection(bobWork.listCallsLog(x.agent.agentId))).toBeInstanceOf(AccessDeniedError);
});
