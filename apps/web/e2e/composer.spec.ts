import { conversation, post, test, visit } from "./test-support/fixtures";
import { expect } from "@playwright/test";

test("channel and thread drafts stay isolated and restore reference labels", async ({
  actors,
  client,
}) => {
  const [first, second] = await Promise.all([
    conversation(actors.sender),
    conversation(actors.sender),
  ]);
  const source = `Thread root ${first.id}`;
  await post(actors.sender, "messaging/messages", { conversationId: first.id, body: source });
  const sender = await client(actors.sender);
  const { page } = sender;
  await visit(sender, first.id);
  const editor = page.getByRole("textbox", { name: /^Message / });
  await editor.fill("@");
  await page.getByRole("tab", { name: "People", exact: true }).click();
  await page.getByRole("combobox", { name: "Search references" }).fill(actors.sender.name);
  await page.getByRole("option", { name: actors.sender.name, exact: true }).click();
  await expect(editor).toContainText(actors.sender.name);
  await expect(editor).toBeFocused();
  await editor.pressSequentially(" channel draft");
  await page
    .getByRole("article")
    .filter({ hasText: source })
    .getByRole("button", { name: "Reply in thread", exact: true })
    .click();
  const reply = page.getByRole("textbox", { name: "Reply in thread…", exact: true });
  await expect(reply).toBeEmpty();
  await reply.fill("thread draft");
  await expect(editor).toContainText("channel draft");
  await page.getByRole("button", { name: second.name, exact: true }).click();
  await expect(editor).toBeEmpty();
  await editor.fill("other destination");
  await page.getByRole("button", { name: first.name, exact: true }).click();
  await expect(editor).toContainText(actors.sender.name);
  await expect(editor).toContainText("channel draft");
  await page
    .getByRole("article")
    .filter({ hasText: source })
    .getByRole("button", { name: "Reply in thread", exact: true })
    .click();
  await expect(reply).toHaveText("thread draft");
});

test("a completed send preserves a newer draft after leaving and returning", async ({
  actors,
  client,
}) => {
  const [first, second] = await Promise.all([
    conversation(actors.sender),
    conversation(actors.sender),
  ]);
  const sender = await client(actors.sender);
  const { page } = sender;
  await visit(sender, first.id);
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requested!: () => void;
  const started = new Promise<void>((resolve) => {
    requested = resolve;
  });
  await page.route("**/api/v1/messaging/messages", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const response = await route.fetch();
    requested();
    await held;
    await route.fulfill({ response });
  });
  const editor = page.getByRole("textbox", { name: /^Message / });
  const sent = `Pending message ${first.id}`;
  try {
    await editor.fill(sent);
    await editor.press("Enter");
    await started;
    await expect(editor).toHaveAttribute("contenteditable", "false");
    await page.getByRole("button", { name: second.name, exact: true }).click();
    await expect(editor).toBeEmpty();
    await editor.fill("other destination");
    await page.getByRole("button", { name: first.name, exact: true }).click();
    await expect(editor).toHaveText(sent);
    await editor.fill("newer draft");
    const completed = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/v1/messaging/messages") &&
        response.request().method() === "POST",
    );
    release();
    await completed;
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("article").filter({ hasText: sent })).toBeVisible();
    await expect(editor).toHaveText("newer draft");
    await page.getByRole("button", { name: second.name, exact: true }).click();
    await expect(editor).toHaveText("other destination");
  } finally {
    release();
  }
});

test("a failed send retains the draft and can be retried without retyping", async ({
  actors,
  client,
}) => {
  const channel = await conversation(actors.sender);
  const sender = await client(actors.sender);
  const { page } = sender;
  await visit(sender, channel.id);
  const editor = page.getByRole("textbox", { name: /^Message / });
  const form = editor.locator("xpath=ancestor::form");
  const body = `Retry message ${channel.id}`;
  const message = page.getByRole("article").filter({ hasText: body });
  await page.route("**/api/v1/messaging/messages", (route) =>
    route.request().method() === "POST" ? route.abort("failed") : route.continue(),
  );
  await editor.fill(body);
  await editor.press("Enter");
  await expect(form.getByRole("alert")).toContainText("Your draft is still here");
  await expect(editor).toHaveText(body);
  await expect(editor).toHaveAttribute("contenteditable", "true");
  await expect(form.getByRole("button", { name: "Send", exact: true })).toBeEnabled();
  await expect(message).toHaveCount(0);

  await page.unroute("**/api/v1/messaging/messages");
  await form.getByRole("button", { name: "Send", exact: true }).click();
  await expect(message).toHaveCount(1);
  await expect(editor).toBeEmpty();
  await expect(form.getByRole("alert")).toHaveCount(0);
  await expect(editor).toBeFocused();
  await page.reload();
  await expect(message).toHaveCount(1);
});

test("composer keeps selection, undo, IME guards and focus after sending", async ({
  actors,
  client,
}) => {
  const channel = await conversation(actors.sender);
  const sender = await client(actors.sender);
  const { page } = sender;
  await visit(sender, channel.id);
  const editor = page.getByRole("textbox", { name: /^Message / });
  await editor.fill("select me");
  await editor.press("Control+Home");
  await editor.press("Control+Shift+End");
  await editor
    .locator("xpath=ancestor::form")
    .getByRole("button", { name: "Bold text", exact: true })
    .click();
  await expect(editor).toHaveText("**select me**");
  await expect(editor).toBeFocused();
  await editor.pressSequentially("replacement");
  await expect(editor).toHaveText("**replacement**");
  await editor.press("Control+z");
  await expect(editor).toHaveText("**select me**");
  await editor.fill("IME draft");
  await editor.dispatchEvent("compositionstart");
  await editor.press("Enter");
  await expect(page.getByRole("article").filter({ hasText: "IME draft" })).toHaveCount(0);
  await expect(editor).toContainText("IME draft");
  await editor.dispatchEvent("compositionend");
  await editor.press("Enter");
  await expect(page.getByRole("article").filter({ hasText: "IME draft" })).toBeVisible();
  await expect(editor).toBeEmpty();
  await expect(editor).toBeFocused();
  await expect(editor).toHaveAttribute("contenteditable", "true");
});
