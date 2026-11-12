import type { DatabaseExecutor } from "../../client";
import { agentAuditEvents, agentRequests, agentWakes, userAgents } from "../../schema";
import { agentWorkFixture, callerFixture, dmTurn } from "../../testing/agent-work";
import { testDatabase } from "../../testing/connection";
import { setupDatabase } from "../../testing/database";
import { rejection } from "../../testing/rejection";
import { saveCallerPolicy as rawSaveCallerPolicy } from "../agents/callers";
import {
  allowCaller,
  approveProposal,
  decideInvocation,
  declineProposal,
  removeCaller,
  respondToRequest,
  saveCallerPolicy,
  ackWakes,
  loadSources,
  pullWakes,
  publishStatus,
} from "./committed";
import { respondToRequest as rawRespondToRequest } from "./decisions";
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

test("committed native calls resolve their device without an extra savepoint", async () => {
  const x = await agentWorkFixture(f);
  const writes = [
    () => ackWakes(db, x.agent.identity, []),
    () => loadSources(db, x.agent.identity, []),
    () => pullWakes(db, x.agent.identity, 10, ["caller_wakes"]),
    () =>
      publishStatus(db, x.agent.identity, {
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

test("committed caller changes and invocation decisions use one transaction each", async () => {
  const x = await callerFixture(f);
  const writes = [
    () => saveCallerPolicy(db, x.owner, x.agent.agentId, "ask"),
    () => allowCaller(db, x.owner, x.agent.agentId, x.carolActorId),
    () => removeCaller(db, x.owner, x.agent.agentId, x.carolActorId),
  ];
  for (const write of writes) {
    transactionCount = 0;
    expect((await write()).hints.length).toBeGreaterThan(0);
    expect(transactionCount).toBe(1);
  }
  await x.bob.sendMessage(x.channel.id, `${x.mention} help`);
  const [invocation] = await f.db.query.agentInvocations.findMany();
  transactionCount = 0;
  expect((await decideInvocation(db, x.owner, invocation!.id, "always_allow")).result).toEqual({
    status: "admitted",
  });
  expect(transactionCount).toBe(1);
});

test("committed answers and declines need no savepoint; approval keeps its action savepoint", async () => {
  const x = await agentWorkFixture(f);
  const turn = dmTurn(x.dm.id);
  const question = await x.call(
    "reply",
    { requestId: crypto.randomUUID(), body: "Which week?", ask: { question: "Which week?" } },
    turn,
  );
  transactionCount = 0;
  expect(
    (
      await respondToRequest(db, x.owner, question.questionId!, {
        type: "questions",
        answers: { answer: ["Next week"] },
      })
    ).result,
  ).toEqual({ status: "resolved" });
  expect(transactionCount).toBe(1);
  const channel = await x.alice.createConversation({ kind: "channel", name: "Updates" });
  for (const decision of [declineProposal, approveProposal]) {
    const proposal = await x.call(
      "propose",
      {
        requestId: crypto.randomUUID(),
        summary: "Post update",
        action: { type: "reply_elsewhere", input: { conversationId: channel.id, body: "Update" } },
      },
      { ...turn, kind: "unattended" },
    );
    transactionCount = 0;
    const result = await decision(db, x.owner, proposal.proposalId);
    if (decision === declineProposal) {
      expect(result.result.outcome.status).toBe("declined");
      expect(transactionCount).toBe(1);
    } else {
      expect(result.result.outcome.status).toBe("executed");
      expect(transactionCount).toBe(2);
    }
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

test("raw and committed policy changes roll back if the audit fails", async () => {
  const x = await callerFixture(f);
  for (const write of [saveCallerPolicy, rawSaveCallerPolicy]) {
    transactionCount = 0;
    expect(
      await rejection(write(failingInsert(db, agentAuditEvents), x.owner, x.agent.agentId, "ask")),
    ).toMatchObject({ message: "Insert unavailable" });
    expect(transactionCount).toBe(1);
    expect(
      (await f.db.query.userAgents.findFirst({ where: eq(userAgents.id, x.agent.agentId) }))!
        .callerPolicy,
    ).toBe("owner");
    expect(await f.db.select().from(agentAuditEvents)).toEqual([]);
  }
});

test("raw and committed answers roll back the decision if creating its wake fails", async () => {
  const x = await agentWorkFixture(f);
  const question = await x.call(
    "reply",
    { requestId: crypto.randomUUID(), body: "Which week?", ask: { question: "Which week?" } },
    dmTurn(x.dm.id),
  );
  for (const write of [respondToRequest, rawRespondToRequest]) {
    transactionCount = 0;
    expect(
      await rejection(
        write(failingInsert(db, agentWakes), x.owner, question.questionId!, {
          type: "questions",
          answers: { answer: ["Next week"] },
        }),
      ),
    ).toMatchObject({ message: "Insert unavailable" });
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
