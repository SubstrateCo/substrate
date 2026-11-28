import { member } from "../../schema";
import { agentWorkFixture, deviceAgentWork, ownerAgentWork } from "../../testing/agent-work";
import { setupDatabase } from "../../testing/database";
import { dmTurn } from "../../testing/turns";
import { createFeedService } from "../notifications/service";
import { accountAttention } from "./summary";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

const f = setupDatabase();

test("a mentioned message and its notification count once until both are read", async () => {
  await f.verifyEmails();
  const chat = f.messaging("alice");
  const channel = await chat.createConversation({ kind: "channel", name: "Launch" });
  await chat.addMembers(channel.id, ["bob@example.com"]);
  const message = await chat.sendMessage(channel.id, `@[person:${f.bob}] Please review`);
  expect(await accountAttention(f.db, "bob")).toEqual({ count: 1 });
  await createFeedService(f.db, { userId: "bob", organizationId: f.orgA }).markAllRead();
  expect(await accountAttention(f.db, "bob")).toEqual({ count: 1 });
  await f.messaging("bob").markRead(channel.id, message.id);
  expect(await accountAttention(f.db, "bob")).toEqual({ count: 0 });
});

test("totals include other memberships but not private messages or former workspaces", async () => {
  await f.verifyEmails();
  const first = f.messaging("alice");
  const a = await first.createConversation({ kind: "channel", name: "First" });
  await first.addMembers(a.id, ["bob@example.com"]);
  await first.sendMessage(a.id, "First workspace");
  const privateChannel = await first.createConversation({
    kind: "channel",
    name: "Private",
    private: true,
  });
  await first.sendMessage(privateChannel.id, "Not for Bob");
  await f.db.insert(member).values({
    id: "bob-b",
    userId: "bob",
    organizationId: f.orgB,
    role: "member",
  });
  const second = f.messaging("outsider", f.orgB);
  const b = await second.createConversation({ kind: "channel", name: "Second" });
  await second.addMembers(b.id, ["bob@example.com"]);
  await second.sendMessage(b.id, "Second workspace");
  expect(await accountAttention(f.db, "bob")).toEqual({ count: 2 });
  await f.db.delete(member).where(eq(member.id, "bob-b"));
  expect(await accountAttention(f.db, "bob")).toEqual({ count: 1 });
});

test("deleted message notifications and another recipient's notifications do not count", async () => {
  await f.verifyEmails();
  const chat = f.messaging("alice");
  const channel = await chat.createConversation({ kind: "channel", name: "Launch" });
  await chat.addMembers(channel.id, ["bob@example.com"]);
  const message = await chat.sendMessage(channel.id, `@[person:${f.bob}] Review`);
  expect(await accountAttention(f.db, "bob")).toEqual({ count: 1 });
  expect(await accountAttention(f.db, "outsider")).toEqual({ count: 0 });
  await chat.deleteMessage(message.id);
  expect(await accountAttention(f.db, "bob")).toEqual({ count: 0 });
});

test("only the owner counts agent approvals, and working or answered requests do not count", async () => {
  const fixture = await agentWorkFixture(f);
  const turn = await fixture.turn(dmTurn(fixture.dm.id));
  expect(await accountAttention(f.db, "alice")).toEqual({ count: 0 });
  const device = await deviceAgentWork(f.db, fixture.agent.identity);
  const request = (
    await device.openRequest({
      turnId: turn.turnId,
      epoch: 0,
      kind: "permission",
      mode: "blocking",
      nativeRequestId: "attention-test",
      conversationId: fixture.dm.id,
      payload: {
        type: "approval",
        title: "Allow command?",
        detail: "Run the requested command",
        options: [
          { id: "allow", label: "Approve", style: "approve" },
          { id: "deny", label: "Decline", style: "deny" },
        ],
      },
    })
  ).result;
  expect(await accountAttention(f.db, "alice")).toEqual({ count: 1 });
  expect(await accountAttention(f.db, "bob")).toEqual({ count: 0 });
  const work = await ownerAgentWork(f.db, fixture.owner);
  await work.respondToRequest(request.id, { type: "approval", optionId: "deny" });
  expect(await accountAttention(f.db, "alice")).toEqual({ count: 0 });
});
