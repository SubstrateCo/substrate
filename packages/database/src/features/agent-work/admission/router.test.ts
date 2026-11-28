import { sessionKeys } from "@substrate/contracts/agent-work";

import { agentSessions, agentWorkItems, messagingMessages } from "../../../schema";
import { agentWorkFixture } from "../../../testing/agent-work";
import { setupDatabase } from "../../../testing/database";
import { threadTurn } from "../../../testing/turns";
import { createMessagingService } from "../../messaging/service";
import { routeMessage } from "./router";
import { expect, test } from "bun:test";
import { asc, eq } from "drizzle-orm";

const f = setupDatabase();

const wakes = () =>
  f.db
    .select({
      sessionKey: agentSessions.key,
      dedupeKey: agentWorkItems.dedupeKey,
      sourceRef: agentWorkItems.sourceRef,
    })
    .from(agentWorkItems)
    .innerJoin(agentSessions, eq(agentSessions.id, agentWorkItems.sessionId))
    .orderBy(asc(agentWorkItems.createdAt), asc(agentWorkItems.id));

test("DM messages admit work in one session per conversation, once per message", async () => {
  const { alice, dm } = await agentWorkFixture(f);
  const sent = await (
    await f.forSession("alice")
  ).messaging.sendMessage(dm.id, "Summarize the roadmap");
  const first = sent.result;
  expect(sent.hints).toContainEqual({ audience: ["user", "alice"], domain: "agent-work" });
  const reply = await alice.sendMessage(dm.id, "Include risks", first.id);
  expect(await wakes()).toEqual([
    {
      sessionKey: sessionKeys.dm(dm.id),
      dedupeKey: `msg:${first.id}`,
      sourceRef: {
        source: "owner_message",
        messageId: first.id,
        conversationId: dm.id,
        threadId: null,
      },
    },
    {
      sessionKey: sessionKeys.dm(dm.id),
      dedupeKey: `msg:${reply.id}`,
      sourceRef: {
        source: "owner_message",
        messageId: reply.id,
        conversationId: dm.id,
        threadId: first.id,
      },
    },
  ]);

  const [row] = await f.db
    .select()
    .from(messagingMessages)
    .where(eq(messagingMessages.id, first.id));
  expect(
    await routeMessage(f.db, { userId: "alice", organizationId: f.orgA }, row!, "agent_dm"),
  ).toEqual([]);
  expect(await wakes()).toHaveLength(2);
});

test("only the owner's own messages start work; agent messages never do", async () => {
  const { agent, alice, bob, agentIdentity } = await agentWorkFixture(f);
  const channel = await alice.createConversation({
    kind: "channel",
    name: "planning",
    emails: ["bob@example.com"],
  });
  await alice.addAgent(channel.id, agent.agentId);
  const mention = `@[agent:${agent.actorId}]`;
  await bob.sendMessage(channel.id, `${mention} do my work`);
  await createMessagingService(f.db, agentIdentity).sendMessage(channel.id, `${mention} loop`);
  await alice.sendMessage(channel.id, "no mention");
  expect(await wakes()).toEqual([]);

  const asked = await alice.sendMessage(channel.id, `${mention} draft the brief`);
  expect(await wakes()).toEqual([
    {
      sessionKey: sessionKeys.thread(asked.id),
      dedupeKey: `msg:${asked.id}`,
      sourceRef: {
        source: "owner_message",
        messageId: asked.id,
        conversationId: channel.id,
        threadId: null,
      },
    },
  ]);
});

test("human follow-ups admit work for a thread participant, and explicit mentions still take precedence", async () => {
  const { agent, alice, call } = await agentWorkFixture(f);
  const channel = await alice.createConversation({ kind: "channel", name: "general" });
  await alice.addAgent(channel.id, agent.agentId);
  const root = await alice.sendMessage(channel.id, "Launch plan");
  await alice.sendMessage(channel.id, "before the agent worked", root.id);
  expect(await wakes()).toEqual([]);

  await call(
    "reply",
    { requestId: crypto.randomUUID(), body: "Here is a draft" },
    threadTurn(channel.id, root.id),
  );
  const followUp = await alice.sendMessage(channel.id, "and also this", root.id);
  expect(await wakes()).toEqual([
    {
      sessionKey: sessionKeys.thread(root.id),
      dedupeKey: `msg:${followUp.id}`,
      sourceRef: {
        source: "owner_message",
        messageId: followUp.id,
        conversationId: channel.id,
        threadId: root.id,
      },
    },
  ]);
  const later = await alice.sendMessage(
    channel.id,
    `@[agent:${agent.actorId}] revise the draft`,
    root.id,
  );
  expect((await wakes()).at(-1)).toEqual({
    sessionKey: sessionKeys.thread(root.id),
    dedupeKey: `msg:${later.id}`,
    sourceRef: {
      source: "owner_message",
      messageId: later.id,
      conversationId: channel.id,
      threadId: root.id,
    },
  });

  await alice.sendMessage(channel.id, "one more", root.id);
  expect(await wakes()).toHaveLength(3);
});
