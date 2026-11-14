import type { DatabaseExecutor } from "../../client";
import { createRepositories } from "../../repositories";
import { agentAuditEvents, agentRequests, agentWakes, userAgents } from "../../schema";
import {
  agentWorkFixture,
  callerFixture,
  deviceAgentWork,
  dmTurn,
  ownerAgentWork,
} from "../../testing/agent-work";
import { testDatabase } from "../../testing/connection";
import { setupDatabase } from "../../testing/database";
import { rejection } from "../../testing/rejection";
import { saveCallerPolicy } from "../agents/callers";
import { respondToRequest } from "./decisions";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

const f = setupDatabase();
let transactionCount = 0;
function trackedTransactions(executor: DatabaseExecutor): DatabaseExecutor {
  return new Proxy(executor, {
    get(target, property: keyof DatabaseExecutor) {
      if (property === "transaction")
        return <T>(work: (tx: DatabaseExecutor) => Promise<T>) => {
          transactionCount++;
          return target.transaction((tx) => work(trackedTransactions(tx)));
        };
      return target[property];
    },
  });
}
const db = trackedTransactions(testDatabase);

test("scoped device writes commit in one transaction each", async () => {
  const x = await agentWorkFixture(f);
  const device = await deviceAgentWork(db, x.agent.identity);
  const writes = [
    () => device.ackWakes([]),
    () => device.loadSources([]),
    () => device.pullWakes(10, ["caller_wakes"]),
    () =>
      device.publishStatus({
        userAgentId: x.agent.agentId,
        state: "idle",
        queuedCount: 0,
        version: 1,
      }),
  ];
  for (const write of writes) {
    transactionCount = 0;
    await write();
    expect(transactionCount).toBe(1);
  }
});

test("scoped agent-work writes commit once each and approval nests its savepoint", async () => {
  const x = await callerFixture(f);
  const agentWork = (await createRepositories(db).forSession(x.owner)).agentWork;
  const writes = [
    () => agentWork.saveCallerPolicy(x.agent.agentId, "ask"),
    () => agentWork.allowCaller(x.agent.agentId, x.carolActorId),
    () => agentWork.removeCaller(x.agent.agentId, x.carolActorId),
  ];
  for (const write of writes) {
    transactionCount = 0;
    expect((await write()).hints.length).toBeGreaterThan(0);
    expect(transactionCount).toBe(1);
  }
  await x.bob.sendMessage(x.channel.id, `${x.mention} help`);
  const [invocation] = await f.db.query.agentInvocations.findMany();
  transactionCount = 0;
  expect((await agentWork.decideInvocation(invocation!.id, "always_allow")).result).toEqual({
    status: "admitted",
  });
  expect(transactionCount).toBe(1);

  const y = await agentWorkFixture(f);
  const owned = (await createRepositories(db).forSession(y.owner)).agentWork;
  const turn = dmTurn(y.dm.id);
  const question = await y.call(
    "reply",
    { requestId: crypto.randomUUID(), body: "Which week?", ask: { question: "Which week?" } },
    turn,
  );
  transactionCount = 0;
  expect(
    (
      await owned.respondToRequest(question.questionId!, {
        type: "questions",
        answers: { answer: ["Next week"] },
      })
    ).result,
  ).toEqual({ status: "resolved" });
  expect(transactionCount).toBe(1);
  const channel = await y.alice.createConversation({ kind: "channel", name: "Updates" });
  for (const decision of ["declineProposal", "approveProposal"] as const) {
    const proposal = await y.call(
      "propose",
      {
        requestId: crypto.randomUUID(),
        summary: "Post update",
        action: { type: "reply_elsewhere", input: { conversationId: channel.id, body: "Update" } },
      },
      { ...turn, kind: "unattended" },
    );
    transactionCount = 0;
    const committed = await owned[decision](proposal.proposalId);
    expect(committed.hints.length).toBeGreaterThan(0);
    expect(committed.result.outcome.status).toBe(
      decision === "approveProposal" ? "executed" : "declined",
    );
    expect(transactionCount).toBe(decision === "approveProposal" ? 2 : 1);
  }
});

// Fail a later insert after the mutation, on the real transaction executor.
function failingInsert(
  db: DatabaseExecutor,
  failedTable: typeof agentAuditEvents | typeof agentWakes,
): DatabaseExecutor {
  return new Proxy(db, {
    get(target, property: keyof DatabaseExecutor) {
      if (property === "transaction")
        return <T>(work: (tx: DatabaseExecutor) => Promise<T>) =>
          target.transaction((tx) => work(failingInsert(tx, failedTable)));
      if (property === "insert")
        // SAFETY: the insert signature is unchanged; only the selected table throws before delegation.
        return ((table: Parameters<DatabaseExecutor["insert"]>[0]) => {
          if (table === failedTable) throw new Error("Insert unavailable");
          return target.insert(table);
        }) as DatabaseExecutor["insert"];
      return target[property];
    },
  });
}

test("raw and scoped policy changes roll back if the audit fails", async () => {
  const x = await callerFixture(f);
  const failing = failingInsert(db, agentAuditEvents);
  const scoped = await ownerAgentWork(failing, x.owner);
  for (const write of [
    () => scoped.saveCallerPolicy(x.agent.agentId, "ask"),
    () => saveCallerPolicy(failing, x.owner, x.agent.agentId, "ask"),
  ]) {
    transactionCount = 0;
    expect(await rejection(write())).toMatchObject({ message: "Insert unavailable" });
    expect(transactionCount).toBe(1);
    expect(
      (await f.db.query.userAgents.findFirst({ where: eq(userAgents.id, x.agent.agentId) }))!
        .callerPolicy,
    ).toBe("owner");
    expect(await f.db.select().from(agentAuditEvents)).toEqual([]);
  }
});

test("raw and scoped answers roll back the decision if creating its wake fails", async () => {
  const x = await agentWorkFixture(f);
  const question = await x.call(
    "reply",
    { requestId: crypto.randomUUID(), body: "Which week?", ask: { question: "Which week?" } },
    dmTurn(x.dm.id),
  );
  const failing = failingInsert(db, agentWakes);
  const scoped = await ownerAgentWork(failing, x.owner);
  const response = { type: "questions" as const, answers: { answer: ["Next week"] } };
  for (const write of [
    () => scoped.respondToRequest(question.questionId!, response),
    () => respondToRequest(failing, x.owner, question.questionId!, response),
  ]) {
    transactionCount = 0;
    expect(await rejection(write())).toMatchObject({ message: "Insert unavailable" });
    expect(transactionCount).toBe(1);
    expect(
      await f.db.query.agentRequests.findFirst({
        where: eq(agentRequests.id, question.questionId!),
      }),
    ).toMatchObject({
      status: "pending",
      response: null,
      resolvedAt: null,
      resolvedByUserId: null,
    });
    expect(await f.db.select().from(agentWakes).where(eq(agentWakes.source, "answer"))).toEqual([]);
  }
});
