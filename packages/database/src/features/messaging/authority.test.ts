import { member, user } from "../../schema";
import { setupDatabase } from "../../testing/database";
import { createAcceptedMessagingService } from "../../testing/messaging";
import { createMessagingService } from "./service";
import { createSharingService } from "./sharing";
import { expect, test } from "bun:test";

const f = setupDatabase();
const resolves = (promise: Promise<unknown>) =>
  promise.then(
    () => true,
    () => false,
  );

// Every kind, created by an admin and by a member, with host and partner viewers of both roles.
async function conversations() {
  await f.db.update(user).set({ emailVerified: true });
  await f.db
    .insert(user)
    .values({ id: "pat", name: "Pat", email: "pat@example.com", emailVerified: true });
  await f.db.insert(member).values({ id: "pat-b", userId: "pat", organizationId: f.orgB });
  const alice = createAcceptedMessagingService(f.db, { userId: "alice", organizationId: f.orgA });
  const bob = createAcceptedMessagingService(f.db, { userId: "bob", organizationId: f.orgA });
  const partners = ["outside@example.com", "pat@example.com"];
  await alice.createConversation({ kind: "dm", emails: ["outside@example.com"] });
  await alice.createConversation({ kind: "dm", emails: ["bob@example.com"] });
  await alice.createConversation({ kind: "group", emails: ["bob@example.com", ...partners] });
  await alice.createConversation({
    kind: "channel",
    name: "Alice",
    private: true,
    emails: ["bob@example.com", ...partners],
  });
  await bob.createConversation({ kind: "dm", emails: ["pat@example.com"] });
  await bob.createConversation({ kind: "group", emails: ["alice@example.com", ...partners] });
  const channel = await bob.createConversation({
    kind: "channel",
    name: "Bob",
    private: true,
    emails: ["alice@example.com"],
  });
  await alice.addMembers(channel.id, partners);
}

test("conversation list flags match the sharing and management checks", async () => {
  await conversations();
  const viewers = [
    { userId: "alice", organizationId: f.orgA },
    { userId: "bob", organizationId: f.orgA },
    { userId: "outsider", organizationId: f.orgB },
    { userId: "pat", organizationId: f.orgB },
  ];
  let checked = 0;
  for (const viewer of viewers) {
    const chat = createMessagingService(f.db, viewer);
    const sharing = createSharingService(f.db, viewer);
    const shareable = new Set((await sharing.listConversations()).map((row) => row.id));
    for (const row of await chat.listConversations()) {
      const share = await resolves(sharing.list(row.id));
      const manage = await resolves(chat.deleteImpact(row.id));
      const flags = { viewer: viewer.userId, name: row.name, kind: row.kind };
      expect({ ...flags, canShare: row.canShare, listed: shareable.has(row.id) }).toEqual({
        ...flags,
        canShare: share,
        listed: share,
      });
      expect({ ...flags, canManage: row.canManage }).toEqual({ ...flags, canManage: manage });
      checked++;
    }
  }
  // Each viewer sees 6 of the 7 conversations, except partners, who see 5.
  expect(checked).toBe(22);
});
