import type { DatabaseExecutor } from "../../core/executor";
import { createRepositories } from "../../repositories";
import { agentRequests, agentWorkItems } from "../../schema";
import { agentWorkFixture, ownerAgentWork } from "../../testing/agent-work";
import { testDatabase } from "../../testing/connection";
import { setupDatabase } from "../../testing/database";
import { rejection } from "../../testing/rejection";
import { dmTurn } from "../../testing/turns";
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
  const device = await createRepositories(db).forDeviceSession(x.agent.identity);
  const writes = [() => device.agentWork.loadSources([]), () => device.host.claim({})];
  for (const write of writes) {
    transactionCount = 0;
    await write();
    expect(transactionCount).toBe(1);
  }
});

test("scoped agent-work writes commit once each and approval nests its savepoint", async () => {
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
    const proposalId = await y.propose(
      "reply",
      { requestId: crypto.randomUUID(), body: "Update", to: { conversationId: channel.id } },
      { ...turn, kind: "unattended" },
    );
    transactionCount = 0;
    const committed = await owned[decision](proposalId);
    expect(committed.hints.length).toBeGreaterThan(0);
    expect(committed.result.outcome.status).toBe(
      decision === "approveProposal" ? "executed" : "declined",
    );
    expect(transactionCount).toBe(decision === "approveProposal" ? 2 : 1);
  }
});

function failingInsert(db: DatabaseExecutor, failedTable: typeof agentWorkItems): DatabaseExecutor {
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

test("answers roll back the decision if creating its work item fails", async () => {
  const x = await agentWorkFixture(f);
  const question = await x.call(
    "reply",
    { requestId: crypto.randomUUID(), body: "Which week?", ask: { question: "Which week?" } },
    dmTurn(x.dm.id),
  );
  const scoped = await ownerAgentWork(failingInsert(db, agentWorkItems), x.owner);
  const response = { type: "questions" as const, answers: { answer: ["Next week"] } };
  transactionCount = 0;
  expect(await rejection(scoped.respondToRequest(question.questionId!, response))).toMatchObject({
    message: "Insert unavailable",
  });
  expect(transactionCount).toBe(1);
  const [storedRequest] = await f.db
    .select()
    .from(agentRequests)
    .where(eq(agentRequests.id, question.questionId!));
  expect(storedRequest).toMatchObject({
    status: "pending",
    response: null,
    resolvedAt: null,
    resolvedByUserId: null,
  });
  expect(
    await f.db.select().from(agentWorkItems).where(eq(agentWorkItems.source, "answer")),
  ).toEqual([]);
});
