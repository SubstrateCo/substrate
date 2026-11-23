import {
  acceptCollaboration,
  conversation,
  conversationButton,
  post,
  test,
  visit,
} from "./test-support/fixtures";
import { expect, type Locator } from "@playwright/test";

const top = async (locator: Locator) => (await locator.boundingBox())?.y ?? Number.NaN;

test("ordinary DMs alert outside messaging and opening them persists the read position", async ({
  account,
  actors,
  client,
}) => {
  await post(account, "messaging/conversations", { kind: "channel", name: "general" });
  const dm = await post<{ id: string }>(account, "messaging/conversations", {
    kind: "dm",
    emails: [actors.sender.email],
    shareHistory: true,
  });
  await acceptCollaboration(actors.sender, dm.id);
  const recipient = await client(account);
  const { page } = recipient;
  await visit(recipient, undefined, "/tasks");
  const body = `An ordinary direct message ${dm.id}`;
  await post(actors.sender, "messaging/messages", { conversationId: dm.id, body });
  const apps = page.getByRole("navigation", { name: "Apps", exact: true });
  await expect(
    apps.getByRole("link", { name: "Messages, unread messages", exact: true }),
  ).toBeVisible();
  await apps.getByRole("link", { name: /^Notifications/ }).click();
  await expect(
    page.getByRole("link", {
      name: `${actors.sender.name} sent you a direct message, unread`,
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText(body, { exact: true })).toBeVisible();
  await apps.getByRole("link", { name: "Messages, unread messages", exact: true }).click();
  const row = conversationButton(page, actors.sender.name);
  await expect(row.getByLabel("1 unread message", { exact: true })).toBeVisible();
  const external = row.getByRole("img", {
    name: "Includes people from another organization",
    exact: true,
  });
  await expect(external).toBeVisible();
  await expect
    .poll(async () => {
      const [name, globe, count] = await Promise.all([
        row.getByText(actors.sender.name, { exact: true }).boundingBox(),
        external.boundingBox(),
        row.getByLabel("1 unread message", { exact: true }).boundingBox(),
      ]);
      return !!(
        name &&
        globe &&
        count &&
        Math.abs(globe.x - (name.x + name.width) - 8) < 1 &&
        count.x >= globe.x + globe.width
      );
    })
    .toBe(true);
  await row.click();
  await expect(page.getByRole("article").filter({ hasText: body })).toBeVisible();
  await expect(row.getByLabel("1 unread message", { exact: true })).toHaveCount(0);
  await expect(apps.getByRole("link", { name: "Messages", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("article").filter({ hasText: body })).toBeVisible();
  await expect(row.getByLabel("1 unread message", { exact: true })).toHaveCount(0);
});

test("a conversation opens at a stable New divider and mentions show a badge until the newest message is seen", async ({
  actors,
  client,
}) => {
  const { sender, member } = actors;
  const channel = await conversation(sender, [member.email]);
  const quiet = await conversation(sender, [member.email]);
  const listed = await sender.request.get("/api/v1/messaging/conversations", {
    params: { organizationId: sender.organizationId },
  });
  const memberActorId: string = (await listed.json()).data
    .find((item: { id: string }) => item.id === channel.id)
    .members.find((item: { name: string }) => item.name === member.name).actorId;
  const say = (actor: typeof sender, body: string) =>
    post<{ id: string }>(actor, "messaging/messages", { conversationId: channel.id, body });
  let read = "";
  for (let index = 1; index <= 10; index += 1) read = (await say(sender, `Earlier ${index}`)).id;
  const marked = await member.request.post("/api/v1/messaging/read", {
    data: { organizationId: member.organizationId, conversationId: channel.id, messageId: read },
  });
  expect(marked.ok()).toBe(true);
  // The reader's own newer message is never the first unread one.
  await say(member, "My own note");
  await say(sender, "First new message");
  await say(sender, `@[person:${memberActorId}] please review`);
  for (let index = 1; index <= 30; index += 1) await say(sender, `New ${index}`);

  const reader = await client(member);
  const { page } = reader;
  await visit(reader, quiet.id);
  const row = conversationButton(page, channel.name);
  await expect(row.getByLabel("1 mention, 32 unread messages", { exact: true })).toBeVisible();
  await expect(row.getByText("1", { exact: true })).toBeVisible();

  await row.click();
  const log = page.getByRole("log", { name: "Messages", exact: true });
  const divider = log.getByRole("separator", { name: "New messages", exact: true });
  const message = (body: string) => log.getByRole("article").filter({ hasText: body }).last();
  const first = message("First new message");
  await expect(divider).toBeInViewport();
  await expect(first).toBeInViewport();
  expect(await top(message("My own note"))).toBeLessThan(await top(divider));
  expect(await top(divider)).toBeLessThan(await top(first));
  // The newest message is out of view, so the conversation stays unread.
  await expect(message("New 30")).not.toBeInViewport();
  await expect(row.getByLabel("1 mention, 32 unread messages", { exact: true })).toBeVisible();

  await log.evaluate((node) => {
    node.scrollTop = node.scrollHeight;
  });
  await expect(message("New 30")).toBeInViewport();
  await expect(row.getByLabel(/unread|mention/)).toHaveCount(0);
  // Reading moves the cursor but not the divider, also when more messages arrive.
  await say(sender, "Arrives while open");
  await expect(message("Arrives while open")).toBeInViewport();
  await expect(divider).toHaveCount(1);
  expect(await top(divider)).toBeLessThan(await top(first));
  expect(await top(message("My own note"))).toBeLessThan(await top(divider));
  await expect(row.getByLabel(/unread|mention/)).toHaveCount(0);

  // With nothing unread, the conversation opens at the newest message without a divider.
  await page.reload();
  await expect(message("Arrives while open")).toBeInViewport();
  await expect(divider).toHaveCount(0);
});
