import { conversation, post, test } from "../test-support/fixtures";
import { expect } from "@playwright/test";

test("a conversation with exactly one page of messages keeps them after Older messages", async ({
  actors,
  client,
}) => {
  const channel = await conversation(actors.sender, [actors.member.email]);
  for (let index = 0; index < 50; index++)
    await post(actors.sender, "messaging/messages", {
      conversationId: channel.id,
      body: `History message ${index}`,
    });
  const viewer = await client(actors.sender);
  const search = new URLSearchParams({
    workspaceId: actors.sender.organizationId,
    conversationId: channel.id,
  });
  await viewer.page.goto(`/messages?${search}`);
  const older = viewer.page.getByRole("button", { name: "Older messages", exact: true });
  await older.click();
  await expect(older).toHaveCount(0);
  await expect(viewer.page.getByText("History message 0", { exact: true })).toBeVisible();
  await expect(viewer.page.getByText("History message 49", { exact: true })).toHaveCount(1);
  await expect(viewer.page.getByText(/No messages yet/)).toHaveCount(0);
});

test("scrolling up offers a quiet scroll to latest, and only a newer message offers New messages", async ({
  actors,
  client,
}) => {
  const channel = await conversation(actors.sender, [actors.member.email]);
  for (let index = 0; index < 40; index++)
    await post(actors.sender, "messaging/messages", {
      conversationId: channel.id,
      body: `Scroll message ${index}`,
    });
  const viewer = await client(actors.sender);
  const search = new URLSearchParams({
    workspaceId: actors.sender.organizationId,
    conversationId: channel.id,
  });
  await viewer.page.goto(`/messages?${search}`);
  const { page } = viewer;
  const log = page.getByRole("log", { name: "Messages", exact: true });
  const message = (body: string) => log.getByRole("article").filter({ hasText: body }).last();
  const scrollToLatest = page.getByRole("button", { name: "Scroll to latest", exact: true });
  const newMessages = page.getByRole("button", { name: "New messages", exact: true });
  await expect(message("Scroll message 39")).toBeInViewport();
  await expect(scrollToLatest).toHaveCount(0);

  await log.evaluate((node) => {
    node.scrollTop = 0;
  });
  await expect(scrollToLatest).toBeVisible();
  await expect(newMessages).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Back to latest", exact: true })).toHaveCount(0);

  await post(actors.member, "messaging/messages", {
    conversationId: channel.id,
    body: "Arrives while away",
  });
  await expect(newMessages).toBeVisible();
  await expect(scrollToLatest).toHaveCount(0);
  await expect(message("Arrives while away")).not.toBeInViewport();

  await newMessages.click();
  await expect(message("Arrives while away")).toBeInViewport();
  await expect(newMessages).toHaveCount(0);
  await expect(scrollToLatest).toHaveCount(0);

  await log.evaluate((node) => {
    node.scrollTop = 0;
  });
  await expect(scrollToLatest).toBeVisible();
  const editor = page.getByRole("textbox", { name: /^Message / });
  await editor.fill("Sent while away");
  await editor.press("Enter");
  await expect(message("Sent while away")).toBeInViewport();
  await expect(newMessages).toHaveCount(0);
  await expect(scrollToLatest).toHaveCount(0);
});

test("sending from an older page returns to the newest messages", async ({ actors, client }) => {
  const channel = await conversation(actors.sender);
  await Promise.all(
    Array.from({ length: 55 }, (_, index) =>
      post(actors.sender, "messaging/messages", {
        conversationId: channel.id,
        body: `Paged message ${index}`,
      }),
    ),
  );
  const viewer = await client(actors.sender);
  const search = new URLSearchParams({
    workspaceId: actors.sender.organizationId,
    conversationId: channel.id,
  });
  await viewer.page.goto(`/messages?${search}`);
  const { page } = viewer;
  const backToLatest = page.getByRole("button", { name: "Back to latest", exact: true });
  await page.getByRole("button", { name: "Older messages", exact: true }).click();
  await expect(backToLatest).toBeVisible();

  const editor = page.getByRole("textbox", { name: /^Message / });
  await editor.fill("Sent from an older page");
  await editor.press("Enter");
  const log = page.getByRole("log", { name: "Messages", exact: true });
  await expect(
    log.getByRole("article").filter({ hasText: "Sent from an older page" }),
  ).toBeInViewport();
  await expect(backToLatest).toHaveCount(0);
});
