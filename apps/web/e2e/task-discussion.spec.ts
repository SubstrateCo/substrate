import { expectChange, post, send, test, visit, type Actor } from "./test-support/fixtures";
import { project, share } from "./test-support/tasks";
import { expect, type Page } from "@playwright/test";

async function task(actor: Actor, projectEntityId: string, title: string) {
  return post<{ id: string }>(actor, "tasks/mutations", {
    action: "createTask",
    organizationId: actor.organizationId,
    projectEntityId,
    title,
  });
}

async function expectNoManagement(page: Page) {
  await expect(page.getByRole("button", { name: "Conversation actions", exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByRole("button", { name: "Add people", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Members(?:,|$)/ })).toHaveCount(0);
}

test("task discussion opens shared messaging and links back to its task", async ({
  actors,
  client,
}) => {
  const created = await post<{ id: string }>(actors.sender, "tasks/mutations", {
    action: "createProject",
    organizationId: actors.sender.organizationId,
    name: "Launch readiness",
  });
  const title = "Review the launch checklist";
  const target = await task(actors.sender, created.id, title);
  const sender = await client(actors.sender);
  await visit(sender, undefined, "/tasks", { projectId: created.id, taskId: target.id });
  const details = sender.page.getByRole("region", { name: "Task details", exact: true });
  const entry = details.getByRole("link", { name: "View full conversation", exact: true });
  await expect(entry).toBeVisible();
  await expect(details.getByRole("textbox")).toHaveCount(0);
  await expect(details.getByRole("region", { name: "Task comments", exact: true })).toHaveCount(0);
  if (process.env.CAPTURE_TASK_DISCUSSION_SCREENSHOTS === "1") {
    await sender.page.screenshot({
      path: test.info().outputPath("task-discussion-entry.png"),
      animations: "disabled",
    });
  }
  await entry.click();
  await expect(sender.page.getByRole("textbox", { name: /^Message / })).toBeVisible();
  const conversationId = new URL(sender.page.url()).searchParams.get("conversationId");
  expect(conversationId).toBeTruthy();
  expect(new URL(sender.page.url()).pathname).toBe("/messages");
  await expect(details).toHaveCount(0);
  await expectNoManagement(sender.page);
  const body = "The checklist is ready. Please review the release notes before we ship.";
  await send(sender.page, body);
  const message = sender.page.getByRole("article").filter({ hasText: body });
  await expect(message.getByText(body, { exact: true })).toBeVisible();
  await expect(message.getByText(actors.sender.name, { exact: true })).toBeVisible();
  const backlink = sender.page.getByRole("link", { name: title, exact: true });
  await expect(backlink).toHaveAttribute("href", new RegExp(`taskId=${target.id}`));
  if (process.env.CAPTURE_TASK_DISCUSSION_SCREENSHOTS === "1") {
    await sender.page.screenshot({
      path: test.info().outputPath("task-discussion-messages.png"),
      animations: "disabled",
    });
  }
  await backlink.click();
  await expect(details.getByRole("heading", { name: title, exact: true })).toBeVisible();
  await expect(
    details
      .getByRole("region", { name: "Discussion", exact: true })
      .getByText(body, { exact: true }),
  ).toBeVisible();
  expect(new URL(sender.page.url()).searchParams.get("projectId")).toBe(created.id);
  expect(new URL(sender.page.url()).searchParams.get("taskId")).toBe(target.id);
  await entry.click();
  await expect(sender.page.getByText(body, { exact: true })).toBeVisible();
  expect(new URL(sender.page.url()).searchParams.get("conversationId")).toBe(conversationId);
});

test("a view-only task discussion cannot send, and revocation clears its open messages live", async ({
  actors,
  client,
}) => {
  const created = await project(actors.sender);
  await share(actors.sender, created.entityId, actors.member.name, "view");
  const title = `Private discussion ${created.entityId}`;
  const target = await task(actors.sender, created.entityId, title);
  const [sender, member] = await Promise.all([client(actors.sender), client(actors.member)]);
  await visit(sender, undefined, "/tasks", { projectId: created.entityId, taskId: target.id });
  await sender.page.getByRole("link", { name: "View full conversation", exact: true }).click();
  const body = `Private release notes ${target.id}`;
  await send(sender.page, body);
  await expect(sender.page.getByText(body, { exact: true })).toBeVisible();
  await visit(member, undefined, "/tasks", { projectId: created.entityId, taskId: target.id });
  await member.page.getByRole("link", { name: "View full conversation", exact: true }).click();
  await expect(member.page.getByText(body, { exact: true })).toBeVisible();
  await expect(
    member.page.getByText(
      "Can view this discussion. Comment access is required to send messages.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(member.page.getByRole("textbox", { name: /^Message / })).toHaveCount(0);
  await expect(member.page.getByRole("button", { name: "Send", exact: true })).toHaveCount(0);
  await expectNoManagement(member.page);
  const message = member.page.getByRole("article").filter({ hasText: body });
  await expect(message.getByRole("button", { name: "React to message", exact: true })).toHaveCount(
    0,
  );
  await message.getByRole("button", { name: "More message actions", exact: true }).click();
  await expect(
    member.page.getByRole("menuitem", { name: "Link existing work", exact: true }),
  ).toHaveCount(0);
  await expect(
    member.page.getByRole("menuitem", { name: "Copy message link", exact: true }),
  ).toBeVisible();
  await member.page.keyboard.press("Escape");
  await message.getByRole("button", { name: "Reply in thread", exact: true }).click();
  const thread = member.page.getByRole("complementary", { name: "Thread", exact: true });
  await expect(thread.getByText(body, { exact: true })).toBeVisible();
  await expect(thread.getByRole("textbox", { name: "Reply in thread…", exact: true })).toHaveCount(
    0,
  );
  await expect(thread.getByRole("button", { name: "Send", exact: true })).toHaveCount(0);
  await member.page.getByRole("button", { name: "Close thread", exact: true }).click();

  await sender.page.getByRole("link", { name: title, exact: true }).click();
  await sender.page.getByRole("button", { name: "Close task", exact: true }).click();
  await sender.page.getByRole("tab", { name: "Settings", exact: true }).click();
  const since = member.events.length;
  await sender.page
    .getByRole("button", { name: `Remove ${actors.member.name}’s access`, exact: true })
    .click();
  await sender.page.getByRole("button", { name: "Remove access", exact: true }).click();
  await expectChange(member, since, "access");
  await expect(
    member.page.getByRole("heading", { name: "Conversation unavailable", exact: true }),
  ).toBeVisible();
  await expect(member.page.getByText(body, { exact: true })).toHaveCount(0);
  await expect(member.page.getByRole("link", { name: title, exact: true })).toHaveCount(0);
  await expect(member.page.getByRole("textbox", { name: /^Message / })).toHaveCount(0);
});

test("task discussion mentions notify people and backlink referenced tasks through shared context", async ({
  actors,
  client,
}) => {
  const created = await project(actors.sender);
  await share(actors.sender, created.entityId, actors.member.name, "edit");
  const [source, referenced] = await Promise.all([
    task(actors.sender, created.entityId, `Review ${created.entityId}`),
    task(actors.sender, created.entityId, `Release notes ${created.entityId}`),
  ]);
  const [sender, member] = await Promise.all([client(actors.sender), client(actors.member)]);
  await Promise.all([
    visit(sender, undefined, "/tasks", { projectId: created.entityId, taskId: source.id }),
    visit(member, undefined, "/notifications"),
  ]);
  await sender.page.getByRole("link", { name: "View full conversation", exact: true }).click();
  const editor = sender.page.getByRole("textbox", { name: /^Message / });
  await expect(editor).toBeVisible();
  const conversationId = new URL(sender.page.url()).searchParams.get("conversationId")!;
  await editor.fill("@");
  await sender.page.getByRole("tab", { name: "People", exact: true }).click();
  await editor.fill(`@${actors.member.name.split(" ")[0]}`);
  await sender.page.getByRole("option", { name: actors.member.name, exact: true }).click();
  await editor.pressSequentially(" please check ");
  await editor.pressSequentially("@");
  await sender.page.getByRole("tab", { name: "Tasks", exact: true }).click();
  await editor.pressSequentially("Release");
  await sender.page
    .getByRole("option", { name: new RegExp(`Release notes ${created.entityId}`) })
    .click();
  const since = member.events.length;
  const response = sender.page.waitForResponse(
    (result) =>
      new URL(result.url()).pathname === "/api/v1/messaging/messages" &&
      result.request().method() === "POST",
  );
  await editor.press("Enter");
  const sent = await response;
  expect(sent.ok()).toBe(true);
  const { data: message } = await sent.json();
  expect(message.body).toContain(`@[task:${referenced.id}]`);
  const article = sender.page.getByRole("article").filter({ hasText: "please check" });
  await expect(article.getByText(actors.member.name, { exact: true })).toBeVisible();
  await expect(
    article.getByRole("link", { name: new RegExp(`Release notes ${created.entityId}`) }),
  ).toBeVisible();
  await expectChange(member, since, "notifications");
  const notice = member.page.getByRole("listitem").filter({
    has: member.page.locator(`a[href*="messageId=${message.id}"]`),
  });
  await expect(notice.getByRole("link")).toHaveAccessibleName(
    new RegExp(`${actors.sender.name} mentioned you in`),
  );
  await notice.getByRole("link").click();
  await expect(
    member.page
      .getByRole("complementary", { name: "Thread", exact: true })
      .getByText("please check", { exact: false }),
  ).toBeVisible();
  expect(new URL(member.page.url()).searchParams.get("conversationId")).toBe(conversationId);

  await article
    .getByRole("link", { name: new RegExp(`Release notes ${created.entityId}`) })
    .click();
  await expect
    .poll(() => new URL(sender.page.url()).searchParams.get("taskId"))
    .toBe(referenced.id);
  const related = sender.page.getByRole("region", { name: "Related discussions", exact: true });
  const backlink = related.locator(`a[href*="messageId=${message.id}"]`);
  await expect(backlink).toBeVisible();
  await backlink.click();
  await expect(
    sender.page
      .getByRole("complementary", { name: "Thread", exact: true })
      .getByText("please check", { exact: false }),
  ).toBeVisible();
  expect(new URL(sender.page.url()).searchParams.get("conversationId")).toBe(conversationId);
  expect(new URL(sender.page.url()).searchParams.get("messageId")).toBe(message.id);
});
