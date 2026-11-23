import {
  acceptCollaboration,
  conversation,
  conversationButton,
  expectChange,
  post,
  send,
  test,
  visit,
} from "./test-support/fixtures";
import { expect } from "@playwright/test";

test("messages and thread controls remain usable at 640px", async ({ actors, client }) => {
  const channel = await conversation(actors.sender);
  await post(actors.sender, "messaging/messages", {
    conversationId: channel.id,
    body: `Layout root ${channel.id}`,
  });
  const sender = await client(actors.sender);
  await sender.page.setViewportSize({ width: 640, height: 900 });
  await visit(sender, channel.id);
  const editor = sender.page.getByRole("textbox", { name: /^Message / });
  await expect(editor).toBeInViewport();
  await sender.page.getByRole("button", { name: "Reply in thread", exact: true }).click();
  const reply = `Layout reply ${channel.id}`;
  await send(sender.page, reply, "Reply in thread");
  await expect(
    sender.page
      .getByRole("complementary", { name: "Thread", exact: true })
      .getByText(reply, { exact: true }),
  ).toBeVisible();
  await sender.page.getByRole("button", { name: "Close thread", exact: true }).click();
  await sender.page.getByRole("button", { name: "Show conversations", exact: true }).click();
  await conversationButton(sender.page, channel.name).click();
  await expect(editor).toBeInViewport();
  expect(
    await sender.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true);
});

test("cross-organization dm and channel creation and bidirectional live messages", async ({
  actors,
  client,
}) => {
  const [sender, partner] = await Promise.all([client(actors.sender), client(actors.partner)]);
  await Promise.all([visit(sender), visit(partner)]);
  // Each kind starts from the conversation the previous one left open.
  for (const kind of ["dm", "channel"] as const) {
    const name = `partner-${crypto.randomUUID()}`;
    if (kind === "channel") {
      await sender.page
        .getByRole("complementary", { name: "Conversations", exact: true })
        .getByRole("button", { name: "New channel", exact: true })
        .click();
      await sender.page.getByLabel("Channel name").fill(name);
      const people = sender.page.getByLabel("Members", { exact: true });
      await people.fill(actors.partner.email);
      await people.press("Enter");
      await sender.page.getByLabel("Make this channel private").check();
    } else {
      await sender.page.getByRole("button", { name: "New message", exact: true }).click();
      await sender.page.getByRole("option", { name: /^New direct message/ }).click();
      const to = sender.page.getByLabel("To", { exact: true });
      await to.fill(actors.partner.email);
      await to.press("Enter");
    }
    // The partner is outside the workspace, so the picker offers "Invite <email>".
    await expect(
      sender.page.getByRole("button", { name: `Remove ${actors.partner.email}`, exact: true }),
    ).toBeVisible();
    const created = sender.page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/v1/messaging/conversations" &&
        response.request().method() === "POST",
    );
    await sender.page
      .getByRole("checkbox", {
        name: "Let invited people read the full conversation history",
        exact: true,
      })
      .check();
    const [response] = await Promise.all([
      created,
      sender.page
        .locator("form")
        .getByRole("button", {
          name: kind === "channel" ? "Create channel" : "Start conversation",
          exact: true,
        })
        .click(),
    ]);
    expect(response.ok()).toBe(true);
    const { data: channel } = await response.json();
    await acceptCollaboration(actors.partner, channel.id);
    await expect(
      sender.page.getByRole("heading", {
        level: 1,
        name: kind === "channel" ? name : actors.partner.name,
        exact: true,
      }),
    ).toBeVisible();
    const partnerSince = partner.events.length;
    const outgoing = `Across organizations ${channel.id}`;
    if (kind === "channel") {
      await sender.page
        .getByRole("region", { name: "Partner channels", exact: true })
        .getByRole("button", { name: /^Partner channels/ })
        .click();
      await conversationButton(sender.page, name).click();
    }
    await send(sender.page, outgoing);
    // The recipient stays on the open dashboard; socket invalidation must discover the new conversation.
    await conversationButton(partner.page, kind === "channel" ? name : actors.sender.name).click();
    await expect(partner.page.getByText(outgoing, { exact: true })).toBeVisible();
    await expectChange(partner, partnerSince, "messaging", channel.id);
    await expect(
      partner.page
        .getByRole("article")
        .filter({ hasText: outgoing })
        .getByText("External", { exact: true }),
    ).toBeVisible();
    const senderSince = sender.events.length;
    const reply = `Partner reply ${channel.id}`;
    await send(partner.page, reply);
    await expect(sender.page.getByText(reply, { exact: true })).toBeVisible();
    await expectChange(sender, senderSince, "messaging", channel.id);
    await expect(
      sender.page
        .getByRole("article")
        .filter({ hasText: reply })
        .getByText("External", { exact: true }),
    ).toBeVisible();
  }
});
