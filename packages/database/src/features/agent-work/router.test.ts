import { sessionKeys } from "@substrate/contracts/agent-work";

import { agentWakes, messagingMessages } from "../../schema";
import { agentWorkFixture, threadTurn } from "../../testing/agent-work";
import { setupDatabase } from "../../testing/database";
import { createMessagingService } from "../messaging/service";
import { routeWake } from "./router";
import { expect, test } from "bun:test";
import { asc, eq } from "drizzle-orm";

const f = setupDatabase();

const wakes = () =>
  f.db
    .select({
      sessionKey: agentWakes.sessionKey,
      dedupeKey: agentWakes.dedupeKey,
      sourceRef: agentWakes.sourceRef,
    })
    .from(agentWakes)
    .orderBy(asc(agentWakes.createdAt), asc(agentWakes.id));

test("DM messages wake the agent in one session per conversation, once per message", async () => {
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
        messageId: first.id,
        conversationId: dm.id,
        threadId: null,
        kind: "direct_message",
      },
    },
    {
      sessionKey: sessionKeys.dm(dm.id),
      dedupeKey: `msg:${reply.id}`,
      sourceRef: {
        messageId: reply.id,
        conversationId: dm.id,
        threadId: first.id,
        kind: "direct_message",
      },
    },
  ]);

  // Routing the same message again creates nothing and asks for no refresh.
  const [row] = await f.db
    .select()
    .from(messagingMessages)
    .where(eq(messagingMessages.id, first.id));
  expect(await routeWake(f.db, { userId: "alice", organizationId: f.orgA }, row!, "dm")).toEqual(
    [],
  );
  expect(await wakes()).toHaveLength(2);
});

test("only the owner's own messages wake the agent; agent messages never do", async () => {
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
        messageId: asked.id,
        conversationId: channel.id,
        threadId: null,
        kind: "mention",
      },
    },
  ]);
});

test("human follow-ups wake a thread participant, and explicit mentions still take precedence", async () => {
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
        messageId: followUp.id,
        conversationId: channel.id,
        threadId: root.id,
        kind: "thread_reply",
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
      messageId: later.id,
      conversationId: channel.id,
      threadId: root.id,
      kind: "mention",
    },
  });

  await alice.sendMessage(channel.id, "one more", root.id);
  expect(await wakes()).toHaveLength(3);
});
