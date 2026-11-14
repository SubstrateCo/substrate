import { ensureUserAgentActor } from "../../core/actors/provisioning";
import { userAgents } from "../../core/actors/user-agents.schema";
import { workspaceContext } from "../../core/session/workspace";
import { AccessDeniedError } from "../../errors";
import { ownerAgentWork } from "../../testing/agent-work";
import { setupDatabase } from "../../testing/database";
import { recordQueries } from "../../testing/queries";
import { rejection } from "../../testing/rejection";
import { createAgentWorkReadRepository } from "./read-repository";
import { expect, test } from "bun:test";

const f = setupDatabase();
const statements = (queries: string[]) =>
  queries.filter((query) => !["begin", "commit"].includes(query));

test("conversation requests combine visibility and rows instead of a preflight query", async () => {
  await f.verifyEmails();
  const conversation = await f
    .messaging("alice")
    .createConversation({ kind: "channel", name: "Requests" });
  const { db, queries } = recordQueries();
  const work = await ownerAgentWork(db, { userId: "alice", organizationId: f.orgA });
  queries.length = 0;
  expect(await work.listConversationRequests(conversation.id)).toEqual([]);
  expect(statements(queries)).toHaveLength(1);
});

test("calls log checks ownership with its rows even when the log is empty", async () => {
  await f.verifyEmails();
  const [agent] = await f.db
    .insert(userAgents)
    .values({ userId: "alice", name: "Scout", instructions: "", harness: "opencode" })
    .returning();
  await ensureUserAgentActor(f.db, {
    userId: "alice",
    organizationId: f.orgA,
    userAgentId: agent!.id,
  });
  const { db, queries } = recordQueries();
  const alice = await ownerAgentWork(db, { userId: "alice", organizationId: f.orgA });
  const bob = await ownerAgentWork(db, { userId: "bob", organizationId: f.orgA });
  queries.length = 0;
  expect(await alice.listCallsLog(agent!.id)).toEqual([]);
  expect(statements(queries)).toHaveLength(1);
  expect(await rejection(bob.listCallsLog(agent!.id))).toBeInstanceOf(AccessDeniedError);
});

test("scoped work reads do not resolve membership or actors again", async () => {
  await f.verifyEmails();
  const { db, queries } = recordQueries();
  const identity = { userId: "alice", organizationId: f.orgA };
  const { context } = await workspaceContext(db, identity);
  const reads = createAgentWorkReadRepository(context, identity);
  queries.length = 0;
  expect(await reads.listStatus()).toEqual([]);
  expect(await reads.listInvocations()).toEqual([]);
  expect(await reads.listMyCalls(crypto.randomUUID())).toEqual([]);
  expect(await reads.listConversationRequests(crypto.randomUUID())).toEqual([]);
  expect(statements(queries)).toHaveLength(4);
});
