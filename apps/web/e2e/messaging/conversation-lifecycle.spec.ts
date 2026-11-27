import { conversation, expectChange, post, test, visit } from "../test-support/fixtures";
import { project } from "../test-support/tasks";
import { expect } from "@playwright/test";

test("deleting a channel warns about linked work and removes the channel for every member", async ({
  actors,
  client,
}) => {
  const [created, channel] = await Promise.all([
    project(actors.sender),
    conversation(actors.sender, [actors.member.email]),
  ]);
  const body = `Delete me ${channel.id}`;
  const message = await post<{ id: string }>(actors.sender, "messaging/messages", {
    conversationId: channel.id,
    body,
  });
  const title = `Survives ${channel.id}`;
  await post(actors.sender, "context/source-tasks", {
    organizationId: actors.sender.organizationId,
    projectEntityId: created.entityId,
    messageId: message.id,
    requestId: crypto.randomUUID(),
    title,
  });
  const [sender, member] = await Promise.all([client(actors.sender), client(actors.member)]);
  await Promise.all([visit(sender, channel.id), visit(member, channel.id)]);
  // Following this link is covered in connected-work.spec.ts; here it shows the link exists.
  await expect(
    sender.page
      .getByRole("article")
      .filter({ hasText: body })
      .getByRole("list", { name: "Created from this message", exact: true })
      .getByRole("link", { name: `${title} Not started`, exact: true }),
  ).toBeVisible();

  const since = member.events.length;
  await sender.page.getByRole("button", { name: "Conversation actions", exact: true }).click();
  await sender.page.getByRole("menuitem", { name: "Delete channel", exact: true }).click();
  const dialog = sender.page.getByRole("dialog", { name: `Delete ${channel.name}?` });
  await expect(dialog.getByText(/1 task or project links to its messages/)).toBeVisible();
  await dialog.getByRole("button", { name: "Delete channel", exact: true }).click();

  await expect(dialog).toHaveCount(0);
  await expect.poll(() => new URL(sender.page.url()).searchParams.get("conversationId")).toBeNull();
  await expect(sender.page.getByText(channel.name, { exact: true })).toHaveCount(0);
  await expectChange(member, since, "messaging");
  await expect(
    member.page.getByRole("heading", { name: "Conversation unavailable", exact: true, level: 2 }),
  ).toBeVisible();
  await expect(member.page.getByText(channel.name, { exact: true })).toHaveCount(0);
});

test("members browse public channels in search and join from the list or the channel", async ({
  actors,
  client,
}) => {
  const create = (name: string) =>
    post<{ id: string; name: string }>(actors.sender, "messaging/conversations", {
      kind: "channel",
      name,
      private: false,
    });
  const [listed, opened] = await Promise.all([
    create(`browse-${crypto.randomUUID()}`),
    create(`browse-${crypto.randomUUID()}`),
  ]);
  const member = await client(actors.member);
  await visit(member);
  const { page } = member;
  // Public channels the member never joined stay out of the sidebar.
  await expect(page.getByText(listed.name, { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Browse channels", exact: true }).first().click();
  const search = page.getByRole("region", { name: "Workspace search", exact: true });
  await expect(search.getByRole("tab", { name: "Channels", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(search.getByText("Browse channels", { exact: true })).toBeVisible();
  await page.getByLabel("Search workspace", { exact: true }).fill(listed.name);
  await expect(search.getByText("1 member", { exact: true })).toBeVisible();
  await search.getByRole("button", { name: `Join ${listed.name}`, exact: true }).click();
  await expect(search.getByText("Joined", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("link", { name: listed.name, exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Browse channels", exact: true }).first().click();
  await page.getByLabel("Search workspace", { exact: true }).fill(opened.name);
  await search.getByRole("link", { name: `Channel: ${opened.name}`, exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get("conversationId")).toBe(opened.id);
  const notice = page.getByText(
    "You’re not in this channel. Join it, or post a message, to add it to your sidebar.",
  );
  await expect(notice).toBeVisible();
  await page.getByRole("button", { name: "Join channel", exact: true }).click();
  await expect(notice).toHaveCount(0);
  await expect(page.getByRole("link", { name: opened.name, exact: true })).toBeVisible();
});

test("a member leaves a private channel and loses access to it", async ({ actors, client }) => {
  const channel = await conversation(actors.sender, [actors.member.email]);
  const member = await client(actors.member);
  await visit(member, channel.id);
  await member.page.getByRole("button", { name: "Conversation actions", exact: true }).click();
  await expect(member.page.getByRole("menuitem", { name: /^Delete/ })).toHaveCount(0);
  await member.page.getByRole("menuitem", { name: "Leave channel", exact: true }).click();
  await member.page
    .getByRole("dialog", { name: `Leave ${channel.name}?` })
    .getByRole("button", { name: "Leave channel", exact: true })
    .click();
  await expect.poll(() => new URL(member.page.url()).searchParams.get("conversationId")).toBeNull();
  await expect(member.page.getByText(channel.name, { exact: true })).toHaveCount(0);
  await visit(member, channel.id);
  await expect(
    member.page.getByRole("heading", { name: "Conversation unavailable", exact: true }),
  ).toBeVisible();
});
