import { signIn } from "./test-support/auth";
import { conversation, conversationButton, post, test, visit } from "./test-support/fixtures";
import { expect } from "@playwright/test";

test("text drafts survive app and settings navigation", async ({ actors, client }) => {
  const channel = await conversation(actors.sender);
  const sender = await client(actors.sender);
  const { page } = sender;
  await visit(sender, channel.id);
  const editor = page.getByRole("textbox", { name: /^Message / });
  await editor.fill("Keep this draft across apps");
  for (const app of ["Tasks", "Notifications"]) {
    await page
      .getByRole("navigation", { name: "Apps", exact: true })
      .getByRole("button", { name: new RegExp(`^${app}(?:,|$)`) })
      .click();
    await expect(editor).toHaveCount(0);
    await page
      .getByRole("navigation", { name: "Apps", exact: true })
      .getByRole("button", { name: "Messages", exact: true })
      .click();
    await conversationButton(page, channel.name).click();
    await expect(editor).toHaveText("Keep this draft across apps");
  }
  for (const settings of ["User settings", "Organization settings"]) {
    await page
      .getByRole("button", { name: `Signed in as ${actors.sender.name}`, exact: true })
      .click();
    await page.getByRole("button", { name: settings, exact: true }).click();
    await expect(editor).toHaveCount(0);
    await page
      .getByRole("navigation", { name: "Apps", exact: true })
      .getByRole("button", { name: "Messages", exact: true })
      .click();
    await conversationButton(page, channel.name).click();
    await expect(editor).toHaveText("Keep this draft across apps");
  }
});

test("retry after a committed send loses its response keeps its request ID across navigation", async ({
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
  const requestIds: string[] = [];
  await page.route("**/api/v1/messaging/messages", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    requestIds.push(route.request().postDataJSON().requestId);
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    if (requestIds.length === 1) return route.abort("failed");
    return route.fulfill({ response });
  });
  const editor = page.getByRole("textbox", { name: /^Message / });
  const body = `Lost success ${first.id}`;
  await editor.fill(body);
  await editor.press("Enter");
  await expect(editor.locator("xpath=ancestor::form").getByRole("alert")).toBeVisible();
  await conversationButton(page, second.name).click();
  await expect(editor).toBeEmpty();
  await page
    .getByRole("navigation", { name: "Apps", exact: true })
    .getByRole("button", { name: "Tasks", exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "Apps", exact: true })
    .getByRole("button", { name: "Messages", exact: true })
    .click();
  await conversationButton(page, first.name).click();
  await expect(editor).toHaveText(body);
  await editor.press("Enter");
  await expect(editor).toBeEmpty();
  expect(requestIds).toHaveLength(2);
  expect(requestIds[0]).toBeTruthy();
  expect(requestIds[1]).toBe(requestIds[0]);
  const response = await actors.sender.request.get("/api/v1/messaging/messages", {
    params: { organizationId: actors.sender.organizationId, conversationId: first.id },
  });
  expect(response.ok()).toBe(true);
  const { data } = await response.json();
  expect(data.filter((message: { body: string }) => message.body === body)).toHaveLength(1);
});

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
  await editor.fill(`@${actors.sender.name.split(" ")[0]}`);
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
  await conversationButton(page, second.name).click();
  await expect(editor).toBeEmpty();
  await editor.fill("other destination");
  await conversationButton(page, first.name).click();
  await expect(editor).toContainText(actors.sender.name);
  await expect(editor).toContainText("channel draft");
  await page
    .getByRole("article")
    .filter({ hasText: source })
    .getByRole("button", { name: "Reply in thread", exact: true })
    .click();
  await expect(reply).toHaveText("thread draft");
});

test("revoked conversation drafts do not return when access is granted again", async ({
  actors,
  client,
}) => {
  const channel = await conversation(actors.sender, [actors.member.email]);
  const member = await client(actors.member);
  const { page } = member;
  await visit(member, channel.id);
  const editor = page.getByRole("textbox", { name: /^Message / });
  await editor.fill("Private revoked draft");
  const response = await actors.sender.request.get("/api/v1/messaging/conversations", {
    params: { organizationId: actors.sender.organizationId },
  });
  expect(response.ok()).toBe(true);
  const { data } = await response.json();
  const entry = data.find((item: { id: string }) => item.id === channel.id);
  const actorId = entry.members.find(
    (item: { name: string }) => item.name === actors.member.name,
  ).actorId;
  const removed = await actors.sender.request.post("/api/v1/messaging/members/remove", {
    data: { organizationId: actors.sender.organizationId, conversationId: channel.id, actorId },
  });
  expect(removed.ok()).toBe(true);
  await expect(conversationButton(page, channel.name)).toHaveCount(0);
  await expect(editor).toHaveCount(0);
  await expect(page.getByText("Private revoked draft", { exact: true })).toHaveCount(0);
  const added = await actors.sender.request.post("/api/v1/messaging/members", {
    data: {
      organizationId: actors.sender.organizationId,
      conversationId: channel.id,
      emails: [actors.member.email],
      shareHistory: true,
    },
  });
  expect(added.ok()).toBe(true);
  await conversationButton(page, channel.name).click();
  await expect(editor).toBeEmpty();
});

test("sign-out clears drafts before another user opens the same conversation", async ({
  actors,
  client,
  freshSession,
}) => {
  test.setTimeout(30_000);
  const account = await freshSession(actors.sender);
  const channel = await conversation(account, [actors.member.email]);
  const sender = await client(account);
  const { page } = sender;
  await visit(sender, channel.id);
  const editor = page.getByRole("textbox", { name: /^Message / });
  await editor.fill("Owner-only unsent draft");
  const signOut = async (name: string) => {
    await page.getByRole("button", { name: `Signed in as ${name}`, exact: true }).click();
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(/\/login/);
  };
  await signOut(account.name);
  await signIn(page, actors.member.email, actors.member.password);
  await conversationButton(page, channel.name).click();
  await expect(editor).toBeEmpty();
  await signOut(actors.member.name);
  await signIn(page, account.email, account.password);
  await conversationButton(page, channel.name).click();
  await expect(editor).toBeEmpty();
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
    await conversationButton(page, second.name).click();
    await expect(editor).toBeEmpty();
    await editor.fill("other destination");
    await conversationButton(page, first.name).click();
    await expect(editor).toHaveText(sent);
    await editor.fill("newer draft");
    const completed = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/v1/messaging/messages") &&
        response.request().method() === "POST",
    );
    release();
    await completed;
    await expect(page.getByRole("article").filter({ hasText: sent })).toBeVisible();
    // The send settles, and its success handler runs, before the composer is editable again.
    await expect(editor).toHaveAttribute("contenteditable", "true");
    await expect(editor).toHaveText("newer draft");
    await conversationButton(page, second.name).click();
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
  await expect(form.getByRole("alert")).toContainText(
    "Couldn’t reach the server. Check your connection and try again.",
  );
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

test("IME composition does not send until composition ends", async ({ actors, client }) => {
  const channel = await conversation(actors.sender);
  const sender = await client(actors.sender);
  const { page } = sender;
  await visit(sender, channel.id);
  const editor = page.getByRole("textbox", { name: /^Message / });
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
