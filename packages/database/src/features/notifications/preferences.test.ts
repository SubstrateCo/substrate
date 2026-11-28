import { realtimeKeys } from "@substrate/contracts/realtime";

import { AccessDeniedError, ValidationError } from "../../errors";
import { createRepositories } from "../../repositories";
import { setupDatabase } from "../../testing/database";
import { rejection } from "../../testing/rejection";
import { messagingParticipants } from "../messaging/schema";
import { notifications } from "./schema";
import { createFeedService } from "./service";
import { expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";

const f = setupDatabase();
const account = async (userId: string) =>
  (await createRepositories(f.db).forOwnerSession({ userId })).notifications;
const feed = (userId: string) => createFeedService(f.db, { userId, organizationId: f.orgA });
const hour = () => new Date(Date.now() + 60 * 60 * 1000).toISOString();

test("account settings start at the defaults, keep unchanged fields and reach every device", async () => {
  await f.verifyEmails();
  const settings = await account("bob");
  expect(await settings.get()).toEqual({
    alertsEnabled: true,
    pausedUntil: null,
    schedule: null,
    preview: "hidden",
    sound: true,
    flash: "idle",
  });
  const schedule = { days: [1, 2, 3, 4, 5], start: 540, end: 1020, timeZone: "Europe/Berlin" };
  const saved = await settings.update({ schedule, sound: false });
  expect(saved.result).toMatchObject({ schedule, sound: false, preview: "hidden" });
  expect(saved.hints).toEqual([
    { audience: realtimeKeys.user("bob"), domain: "notification-preferences" },
  ]);
  expect((await settings.update({ preview: "sender" })).result).toMatchObject({
    schedule,
    sound: false,
    preview: "sender",
  });
  expect((await settings.update({ schedule: null })).result.schedule).toBeNull();
  // Other accounts keep their own settings.
  expect((await (await account("alice")).get()).sound).toBe(true);
  // SAFETY: The value is deliberately outside the typed input, as an untrusted caller could send.
  expect(await rejection(settings.update({ preview: "everything" } as never))).toBeInstanceOf(
    ValidationError,
  );
});

test("workspace settings belong to one membership", async () => {
  await f.verifyEmails();
  const bob = await f.forSession("bob");
  expect(await bob.notificationPreferences.workspace()).toEqual({
    organizationId: f.orgA,
    channels: "mentions",
    mutedUntil: null,
    assignments: true,
  });
  const mutedUntil = hour();
  const saved = await bob.notificationPreferences.updateWorkspace({ channels: "all", mutedUntil });
  expect(saved.result).toMatchObject({ channels: "all", assignments: true });
  expect(Date.parse(saved.result.mutedUntil!)).toBe(Date.parse(mutedUntil));
  expect((await (await f.forSession("alice")).notificationPreferences.workspace()).channels).toBe(
    "mentions",
  );
});

test("conversation settings require the actor's own live membership", async () => {
  await f.verifyEmails();
  const alice = f.messaging("alice");
  const dm = await alice.createConversation({ kind: "dm", emails: ["bob@example.com"] });
  const channel = await alice.createConversation({ kind: "channel", name: "Ops", private: false });
  const bob = await f.forSession("bob");
  expect(await bob.notificationPreferences.conversation(dm.id)).toEqual({
    level: null,
    mutedUntil: null,
  });
  expect(
    (await bob.notificationPreferences.updateConversation(dm.id, { level: "mentions" })).result,
  ).toEqual({ level: "mentions", mutedUntil: null });
  // A visible public channel the actor has not joined holds no settings.
  expect(
    await rejection(bob.notificationPreferences.updateConversation(channel.id, { level: "all" })),
  ).toBeInstanceOf(AccessDeniedError);
  await f.db
    .update(messagingParticipants)
    .set({ leftAt: new Date() })
    .where(
      and(
        eq(messagingParticipants.conversationId, dm.id),
        eq(messagingParticipants.actorEntityId, f.bob),
      ),
    );
  expect(await rejection(bob.notificationPreferences.conversation(dm.id))).toBeInstanceOf(
    AccessDeniedError,
  );
});

test("the feed keeps every notice and marks which ones may alert now", async () => {
  await f.verifyEmails();
  const alice = f.messaging("alice");
  const dm = await alice.createConversation({ kind: "dm", emails: ["bob@example.com"] });
  await alice.sendMessage(dm.id, "hello");
  const alertOf = async () => (await feed("bob").list()).map((item) => item.alert);
  expect(await alertOf()).toEqual([true]);
  const bob = await f.forSession("bob");
  await bob.notificationPreferences.updateConversation(dm.id, { level: "mentions" });
  expect(await alertOf()).toEqual([false]);
  await bob.notificationPreferences.updateConversation(dm.id, { level: null });
  await (await account("bob")).update({ pausedUntil: hour() });
  expect(await alertOf()).toEqual([false]);
  await (await account("bob")).update({ pausedUntil: null });
  await bob.notificationPreferences.updateWorkspace({ mutedUntil: hour() });
  expect(await alertOf()).toEqual([false]);
});

test("channel members get every top-level post only when they choose all", async () => {
  await f.verifyEmails();
  const alice = f.messaging("alice");
  const channel = await alice.createConversation({ kind: "channel", name: "Ops", private: false });
  await f.messaging("bob").joinConversation(channel.id);
  const noticesFor = async (messageId: string) =>
    (await f.db.select().from(notifications).where(eq(notifications.messageId, messageId))).map(
      (row) => `${row.recipientActorEntityId}:${row.kind}`,
    );
  expect(await noticesFor((await alice.sendMessage(channel.id, "default")).id)).toEqual([]);
  const bob = await f.forSession("bob");
  await bob.notificationPreferences.updateWorkspace({ channels: "all" });
  const followed = await alice.sendMessage(channel.id, "workspace level");
  expect(await noticesFor(followed.id)).toEqual([`${f.bob}:message`]);
  expect((await feed("bob").list())[0]).toMatchObject({ messageId: followed.id, alert: true });
  // The channel's own level overrides the workspace level.
  await bob.notificationPreferences.updateConversation(channel.id, { level: "mentions" });
  expect(await noticesFor((await alice.sendMessage(channel.id, "override")).id)).toEqual([]);
  await bob.notificationPreferences.updateConversation(channel.id, { level: "all" });
  const root = await alice.sendMessage(channel.id, "root");
  expect(await noticesFor(root.id)).toEqual([`${f.bob}:message`]);
  // Thread replies reach only the thread's people.
  const reply = await alice.sendMessage(channel.id, "reply", root.id);
  expect(await noticesFor(reply.id)).toEqual([]);
});
