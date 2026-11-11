import { setupDatabase } from "../../testing/database";
import { messagingParticipants } from "../messaging/schema";
import { notifications } from "./schema";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

const f = setupDatabase();

test("ordinary DM and group messages notify other live people, not the sender or public channels", async () => {
  await f.verifyEmails();
  const alice = f.messaging("alice");
  for (const kind of ["dm", "group"] as const) {
    const emails =
      kind === "group" ? ["bob@example.com", "outside@example.com"] : ["bob@example.com"];
    const conversation = await alice.createConversation({ kind, emails });
    const sent = await alice.sendMessage(conversation.id, "hello");
    const notices = await f.db
      .select()
      .from(notifications)
      .where(eq(notifications.messageId, sent.id));
    expect(notices.map((row) => `${row.recipientActorEntityId}:${row.kind}`).sort()).toEqual(
      (kind === "group" ? [f.bob, f.outsider] : [f.bob]).map((id) => `${id}:message`).sort(),
    );
    const mention = await alice.sendMessage(conversation.id, `@[person:${f.bob}]`);
    expect(
      (await f.db.select().from(notifications).where(eq(notifications.messageId, mention.id)))
        .filter((row) => row.recipientActorEntityId === f.bob)
        .map((row) => row.kind),
    ).toEqual(["mention"]);
    await f.db
      .update(messagingParticipants)
      .set({ leftAt: new Date() })
      .where(eq(messagingParticipants.actorEntityId, f.bob));
    const afterLeave = await alice.sendMessage(conversation.id, "after leaving");
    expect(
      (
        await f.db.select().from(notifications).where(eq(notifications.messageId, afterLeave.id))
      ).filter(
        (row) => row.recipientActorEntityId === f.bob || row.recipientActorEntityId === f.alice,
      ),
    ).toEqual([]);
  }
  const channel = await alice.createConversation({
    kind: "channel",
    name: "public",
    private: false,
  });
  await f.messaging("bob").joinConversation(channel.id);
  const sent = await alice.sendMessage(channel.id, "not an alert");
  expect(
    await f.db.select().from(notifications).where(eq(notifications.messageId, sent.id)),
  ).toEqual([]);
});
