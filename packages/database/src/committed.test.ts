import { realtimeKeys, type RealtimeHint } from "@substrate/contracts/realtime";

import { commit } from "./core/effects";
import { workspaceContext } from "./core/session/workspace";
import { AccessDeniedError, ConflictError } from "./errors";
import { claimTurns } from "./features/agent-work/host/claim";
import { proposeToolCall } from "./features/mcp/proposals";
import { requireLiveTurn } from "./features/mcp/turn";
import { createRepositories } from "./repositories";
import { notifications, messagingInvitations, member } from "./schema";
import { agentWorkFixture, hostWork, ownerAgentWork } from "./testing/agent-work";
import { setupDatabase } from "./testing/database";
import { recordQueries } from "./testing/queries";
import { rejection } from "./testing/rejection";
import { dmTurn } from "./testing/turns";
import { beforeEach, expect, test } from "bun:test";
import { eq } from "drizzle-orm";

const f = setupDatabase();
beforeEach(async () => {
  await f.verifyEmails();
});

test("workspace reads reuse the scope already resolved by forSession", async () => {
  const channel = await f.messaging("alice").createConversation({ kind: "channel", name: "Scope" });
  const { db, queries } = recordQueries();
  const repositories = await createRepositories(db).forSession({
    userId: "alice",
    organizationId: f.orgA,
  });
  queries.length = 0;
  expect(await repositories.messaging.listMessages(channel.id)).toEqual([]);
  expect(await repositories.context.messagePage([])).toEqual([]);
  expect(await repositories.feed.hasUnread()).toBe(false);
  expect(await repositories.sharing.inbox()).toEqual([]);
  expect(await repositories.sharing.listConversations()).toMatchObject([{ id: channel.id }]);
  expect(await repositories.agentWork.listStatus()).toEqual([]);
  expect(await repositories.agentWork.listConversationRequests(channel.id)).toEqual([]);
  expect(
    queries.filter(
      (query) => query.startsWith("select") && query.includes('from "user" inner join "member"'),
    ),
  ).toEqual([]);
});

test("standalone writes expose the same effects as transaction writes", async () => {
  const repositories = await f.forSession("alice");
  const created = await repositories.projects.create({ name: "Standalone" });
  expect(created.hints).toEqual([
    {
      audience: realtimeKeys.entity(f.orgA, created.result.entityId),
      domain: "tasks",
      projectId: created.result.entityId,
    },
  ]);
  const direct = await repositories.tasks.create({
    projectEntityId: created.result.entityId,
    title: "Direct",
  });
  const grouped = await repositories.transaction((tx) =>
    tx.tasks.create({ projectEntityId: created.result.entityId, title: "Grouped" }),
  );
  expect(direct.result.title).toBe("Direct");
  expect(grouped.result.title).toBe("Grouped");
  const taskHint = (taskId: string): RealtimeHint => ({
    audience: realtimeKeys.entity(f.orgA, created.result.entityId),
    domain: "tasks",
    projectId: created.result.entityId,
    taskIds: [taskId],
  });
  expect(direct.hints).toEqual([taskHint(direct.result.entityId)]);
  expect(grouped.hints).toEqual([taskHint(grouped.result.entityId)]);
});

test("messaging collects send, reaction, membership and removal effects", async () => {
  const repositories = await f.forSession("alice");
  const channel = await repositories.messaging.createConversation({
    kind: "channel",
    name: "Updates",
  });
  const hint = {
    audience: realtimeKeys.conversation(channel.result.id),
    domain: "messaging" as const,
  };
  expect(channel.hints).toEqual([hint]);
  const joined = await repositories.messaging.joinConversation(channel.result.id);
  expect(joined.hints).toEqual([]);
  const added = await repositories.messaging.addMembers(channel.result.id, ["bob@example.com"]);
  expect(added.hints).toContainEqual(hint);
  expect(added.hints).toContainEqual({
    audience: realtimeKeys.organization(f.orgA),
    domain: "messaging",
  });
  const duplicate = await repositories.messaging.addMembers(channel.result.id, ["bob@example.com"]);
  expect(duplicate.hints).toEqual([]);
  const sent = await repositories.messaging.sendMessage(
    channel.result.id,
    `Hello @[person:${f.bob}]`,
  );
  expect(sent.hints).toContainEqual({
    ...hint,
    scope: "messages",
    messageId: sent.result.id,
    threadId: null,
  });
  expect(sent.hints).toContainEqual({
    audience: realtimeKeys.actor(f.orgA, f.bob),
    domain: "notifications",
  });
  const reaction = await repositories.messaging.toggleReaction(sent.result.id, "👍");
  expect(reaction.result.active).toBe(true);
  expect(reaction.hints).toEqual([
    { ...hint, scope: "reactions", messageId: sent.result.id, threadId: null },
  ]);
  const bob = await f.forSession("bob");
  const left = await bob.messaging.leaveConversation(channel.result.id);
  expect(left.hints).toContainEqual({ audience: realtimeKeys.user("bob"), domain: "messaging" });
  const deleted = await repositories.messaging.deleteConversation(channel.result.id);
  expect(deleted.hints).toContainEqual({
    audience: realtimeKeys.organization(f.orgA),
    domain: "context",
  });
  expect(await repositories.messaging.listConversations()).toEqual([]);
});

test("sharing mail is collected only for queued invitations and survives no failed savepoint", async () => {
  const repositories = await f.forSession("alice");
  const { result: channel } = await repositories.messaging.createConversation({
    kind: "channel",
    name: "Shared",
  });
  const failure = new Error("rollback sharing");
  const rolledBack = await repositories.transaction(async (tx) => {
    expect(
      await rejection(
        tx.transaction(async (nested) => {
          await nested.sharing.invite(channel.id, {
            email: "outside@example.com",
            shareHistory: true,
          });
          throw failure;
        }),
      ),
    ).toBe(failure);
    return null;
  });
  expect(rolledBack).toEqual({ result: null, hints: [] });
  expect(await f.db.select().from(messagingInvitations)).toEqual([]);
  const invited = await repositories.sharing.invite(channel.id, {
    email: "outside@example.com",
    shareHistory: true,
  });
  expect(invited.mail).toEqual(["sharing"]);
  expect(invited.hints).toContainEqual({
    audience: realtimeKeys.user("outsider"),
    domain: "access",
  });
  const resent = await repositories.sharing.resend(invited.result.id);
  expect(resent.mail).toEqual(["sharing"]);
  const revoked = await repositories.sharing.revoke(resent.result.id);
  expect(revoked.mail).toBeUndefined();
});

test("owner-session invitation acceptance checks the chosen workspace and decline needs no membership", async () => {
  const repositories = await f.forSession("alice");
  const { result: channel } = await repositories.messaging.createConversation({
    kind: "channel",
    name: "Partner",
  });
  const invited = await repositories.sharing.invite(channel.id, {
    email: "outside@example.com",
    shareHistory: true,
  });
  const owner = await createRepositories(f.db).forOwnerSession({ userId: "outsider" });
  expect(await rejection(owner.sharing.accept(invited.result.id, f.orgA, true))).toBeInstanceOf(
    AccessDeniedError,
  );
  const accepted = await owner.sharing.accept(invited.result.id, f.orgB, true);
  expect(accepted.result.status).toBe("accepted");
  expect(accepted.hints).toContainEqual({
    audience: realtimeKeys.organization(f.orgB),
    domain: "access",
  });
  expect(accepted.mail).toBeUndefined();
  const another = await repositories.sharing.invite(channel.id, {
    email: "outside@example.com",
    shareHistory: true,
  });
  await f.db.delete(member).where(eq(member.userId, "outsider"));
  const declined = await owner.sharing.decline(another.result.id);
  expect(declined.result.declined).toBe(true);
  expect(declined.hints).toContainEqual({
    audience: realtimeKeys.user("outsider"),
    domain: "access",
  });
  expect(declined.mail).toBeUndefined();
});

test("feed read hints reflect changed rows and repeated reads cause no echo", async () => {
  const alice = await f.forSession("alice");
  const { result: project } = await alice.projects.create({ name: "Notifications" });
  await alice.permissions.grant({
    entityId: project.entityId,
    actorEntityId: f.bob,
    level: "view",
  });
  await alice.tasks.create({
    projectEntityId: project.entityId,
    title: "Assigned",
    assigneeActorEntityId: f.bob,
  });
  const [notice] = await f.db.select().from(notifications);
  const bob = await f.forSession("bob");
  const read = await bob.feed.markRead(notice!.id);
  expect(read.hints).toEqual([{ audience: realtimeKeys.user("bob"), domain: "notifications" }]);
  expect((await bob.feed.markRead(notice!.id)).hints).toEqual([]);
  expect((await bob.feed.markAllRead()).hints).toEqual([]);
});

test("owner agent writes return committed effects without a workspace", async () => {
  await f.db.delete(member).where(eq(member.userId, "alice"));
  const owner = await createRepositories(f.db).forOwnerSession({ userId: "alice" });
  const saved = await owner.agents.saveAgent({
    name: "Helper",
    instructions: "Help",
    harness: "opencode",
    enabled: true,
    disabledApps: [],
    substrateGuide: true,
  });
  expect(saved.hints).toEqual([{ audience: realtimeKeys.user("alice"), domain: "agents" }]);
  const deleted = await owner.agents.deleteAgent(saved.result.id);
  expect(deleted.hints).toEqual(saved.hints);
  expect((await owner.agents.list()).agents).toEqual([]);
});

test("MCP proposals and approved actions expose owner and confirmed notification effects", async () => {
  const { owner, agent, agentIdentity, dm, turn } = await agentWorkFixture(f);
  const context = await turn(dmTurn(dm.id));
  const repositories = await f.forSession("alice");
  const { result: project } = await repositories.projects.create({ name: "Approval" });
  await repositories.permissions.grant({
    entityId: project.entityId,
    actorEntityId: f.bob,
    level: "view",
  });
  const proposed = await commit(f.db, async (tx) => {
    const { context: ctx } = await workspaceContext(tx, agentIdentity);
    const live = await requireLiveTurn(tx, agentIdentity, context, agent.identity.installationId);
    return proposeToolCall(
      ctx,
      agentIdentity,
      { entityId: agent.actorId, userAgentId: agent.agentId },
      live,
      {
        tool: "create_task",
        input: { projectId: project.entityId, title: "Follow up", assigneeActorId: f.bob },
      },
    );
  });
  const ownerHint = { audience: realtimeKeys.user("alice"), domain: "agent-work" as const };
  expect(proposed.hints).toEqual([ownerHint]);
  const ownerWork = await ownerAgentWork(f.db, owner);
  const approved = await ownerWork.approveProposal(proposed.result);
  expect(approved.result.outcome.status).toBe("executed");
  expect(approved.hints).toContainEqual(ownerHint);
  expect(approved.hints).toContainEqual(
    expect.objectContaining({
      audience: realtimeKeys.entity(f.orgA, project.entityId),
      domain: "tasks",
      projectId: project.entityId,
    }),
  );
  expect(approved.hints).toContainEqual({
    audience: realtimeKeys.actor(f.orgA, f.bob),
    domain: "notifications",
  });
  expect(await rejection(ownerWork.approveProposal(proposed.result))).toBeInstanceOf(ConflictError);
  expect(await f.db.select().from(notifications)).toHaveLength(1);
});

test("a host claim exposes the owner's agent-work hint, and an empty claim exposes none", async () => {
  const { agent, alice, dm } = await agentWorkFixture(f);
  const host = await hostWork(f.db, agent.identity);
  expect((await host.claim({})).hints).toEqual([]);
  await alice.sendMessage(dm.id, "Summarize the week");
  const later = new Date(Date.now() + 5_000);
  const claimed = await commit(f.db, (tx) =>
    claimTurns(tx, { ...agent.identity, deviceId: agent.device.id }, {}, later),
  );
  expect(claimed.result).toHaveLength(1);
  expect(claimed.hints).toEqual([{ audience: realtimeKeys.user("alice"), domain: "agent-work" }]);
});
