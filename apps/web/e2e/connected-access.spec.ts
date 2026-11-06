import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { provisionVerifiedAccount, type TestAccount } from "./auth";
import { Mailpit } from "./mailpit";
import { provisionMember, provisionWorkspace } from "./organizations";

async function select(page: Page, label: string, option: string) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

async function send(page: Page, label: string, body: string) {
  const input = page.getByRole("textbox", { name: label, exact: true });
  await input.fill(body);
  await input.press("Enter");
  await expect(input).toHaveValue("");
}

async function notifications(page: Page) {
  await page.getByRole("button", { name: /^Notifications(?:, unread notifications)?$/ }).click();
  return page.getByRole("region", { name: "Notifications", exact: true });
}

async function searchAbsent(page: Page, query: string) {
  await page.keyboard.press("Control+k");
  const panel = page.getByRole("region", { name: "Workspace search", exact: true });
  await page.getByRole("combobox", { name: "Search workspace", exact: true }).fill(query);
  await expect(
    panel.getByText("No accessible results found. Try another search.", { exact: true }),
  ).toBeVisible();
  await expect(panel.getByRole("link")).toHaveCount(0);
  await page.getByRole("combobox", { name: "Search workspace", exact: true }).press("Escape");
  await expect(panel).toBeHidden();
}

test("connected work preserves private boundaries and assignment notifications", async ({
  browser,
  request,
}) => {
  test.setTimeout(360_000);
  const suffix = randomUUID();
  const account = (label: string): TestAccount => ({
    name: `${label} ${suffix}`,
    email: `${label.toLowerCase()}-${suffix}@example.test`,
    password: `Connected-${randomUUID()}!`,
  });
  const owner = account("ConnectedOwner");
  const member = account("TaskOnly");
  const external = account("DiscussionOnly");
  const contexts = await Promise.all([
    browser.newContext(),
    browser.newContext(),
    browser.newContext(),
  ]);
  const [ownerPage, memberPage, externalPage] = await Promise.all(
    contexts.map((context) => context.newPage()),
  );
  const mailpit = new Mailpit(request);
  const workspace = `Connected ${suffix}`;
  const project = `Secret project ${suffix}`;
  const title = `Secret task ${suffix}`;
  const editedTitle = `Edit assigned ${suffix}`;
  const conversation = `Secret discussion ${suffix}`;
  const source = `Confidential source ${suffix}`;
  let taskHref = "";
  try {
    await test.step("provision independent authenticated users and explicit project access", async () => {
      await Promise.all([
        provisionVerifiedAccount(ownerPage, mailpit, owner),
        provisionVerifiedAccount(memberPage, mailpit, member),
        provisionVerifiedAccount(externalPage, mailpit, external),
      ]);
      await provisionWorkspace(ownerPage, workspace, `connected-${suffix}`);
      await provisionWorkspace(externalPage, `External ${suffix}`, `external-connected-${suffix}`);
      await provisionMember(ownerPage, memberPage, member.email);
      await expect(
        memberPage.getByRole("button", { name: `${workspace} ▾`, exact: true }),
      ).toBeVisible();
      await ownerPage.getByRole("button", { name: "Tasks", exact: true }).click();
      await ownerPage.getByRole("button", { name: "New project", exact: true }).click();
      await ownerPage.getByLabel("Project name", { exact: true }).fill(project);
      await ownerPage.getByRole("button", { name: "Create project", exact: true }).click();
      await ownerPage.getByRole("tab", { name: "Project settings", exact: true }).click();
      await select(ownerPage, "Person or agent", member.name);
      await select(ownerPage, "Permission", "View");
      await ownerPage.getByRole("button", { name: "Update access", exact: true }).click();
      await ownerPage.getByRole("button", { name: "Confirm access", exact: true }).click();
      await expect(
        ownerPage
          .getByRole("region", { name: "Project sharing", exact: true })
          .getByRole("listitem")
          .filter({ has: ownerPage.getByText(member.name, { exact: true }) })
          .getByText("View access", { exact: true }),
      ).toBeVisible();
    });

    await test.step("create an assigned task from a discussion that the assignee cannot read", async () => {
      await ownerPage.getByRole("button", { name: "Messages", exact: true }).click();
      await ownerPage
        .getByRole("complementary", { name: "Conversations", exact: true })
        .getByRole("button", { name: "Create channel", exact: true })
        .click();
      await ownerPage.getByLabel("Channel name", { exact: true }).fill(conversation);
      await ownerPage.getByLabel("Add people (optional)", { exact: true }).fill(external.email);
      await ownerPage.getByRole("checkbox", { name: "Make this channel private" }).check();
      await ownerPage.getByRole("button", { name: "Create channel", exact: true }).last().click();
      await send(ownerPage, `Message #${conversation}`, source);
      const article = ownerPage.getByRole("article").filter({ hasText: source });
      await article.getByRole("button", { name: "Create task", exact: true }).click();
      await select(ownerPage, "Destination project", project);
      await ownerPage.getByLabel("Task title", { exact: true }).fill(title);
      await select(ownerPage, "Assignee", member.name);
      await ownerPage.getByRole("button", { name: "Create task", exact: true }).last().click();
      const created = ownerPage.getByRole("link", { name: "Open created task", exact: true });
      await expect(created).toBeVisible();
      taskHref = (await created.getAttribute("href"))!;
      await created.click();
      await expect(
        ownerPage.getByRole("region", { name: "Related context", exact: true }),
      ).toContainText(source);
      await memberPage.reload();
      const panel = await notifications(memberPage);
      const item = panel
        .getByRole("listitem")
        .filter({ has: memberPage.getByText(title, { exact: true }) });
      await expect(item.getByText("Assigned to you", { exact: true })).toBeVisible();
      await expect(item).toContainText("Unread");
      await item.getByRole("button", { name: "Mark as read", exact: true }).click();
      await expect(item).toContainText("Read");
      await memberPage.reload();
      const refreshed = await notifications(memberPage);
      await expect(refreshed.getByRole("listitem").filter({ hasText: title })).toContainText(
        "Read",
      );
      await refreshed.getByRole("link", { name: `Assigned to you ${title}`, exact: true }).click();
      await expect(
        memberPage
          .getByRole("region", { name: "Task details", exact: true })
          .getByRole("heading", { name: title, exact: true }),
      ).toBeVisible();
      expect(new URL(memberPage.url()).searchParams.get("taskId")).toBe(
        new URL(taskHref, memberPage.url()).searchParams.get("taskId"),
      );
      const related = memberPage.getByRole("region", { name: "Related context", exact: true });
      await expect(
        related.getByText("No accessible discussions linked yet.", { exact: true }),
      ).toBeVisible();
      await expect(related).not.toContainText(source);
      await expect(related).not.toContainText(conversation);
      await expect(
        memberPage.getByRole("region", { name: "Task activity", exact: true }),
      ).not.toContainText("Created from a discussion");
      await searchAbsent(memberPage, source);
    });

    await test.step("discussion-only external user sees no private task metadata or access expansion", async () => {
      await externalPage.reload();
      await externalPage.getByRole("button", { name: conversation, exact: true }).click();
      const article = externalPage.getByRole("article").filter({ hasText: source });
      await expect(article).toBeVisible();
      await expect(article.getByRole("link", { name: title, exact: true })).toHaveCount(0);
      await expect(article).not.toContainText(title);
      await searchAbsent(externalPage, title);
      await externalPage.goto(taskHref);
      await expect(externalPage.getByRole("heading", { name: title, exact: true })).toHaveCount(0);
      await expect(externalPage.getByText(source, { exact: true })).toHaveCount(0);
    });

    await test.step("editing an unassigned task emits a navigable assignment notification", async () => {
      await ownerPage.getByRole("button", { name: "New task", exact: true }).click();
      await ownerPage.getByLabel("Task title", { exact: true }).fill(editedTitle);
      await ownerPage.getByRole("button", { name: "Create task", exact: true }).click();
      await expect(
        ownerPage
          .getByRole("region", { name: "Task details", exact: true })
          .getByRole("heading", { name: editedTitle, exact: true }),
      ).toBeVisible();
      await ownerPage.getByRole("button", { name: "Edit task", exact: true }).click();
      await select(ownerPage, "Assignee", member.name);
      await ownerPage.getByRole("button", { name: "Save task", exact: true }).click();
      await memberPage.reload();
      const panel = await notifications(memberPage);
      await panel
        .getByRole("link", { name: `Assigned to you ${editedTitle}`, exact: true })
        .click();
      await expect(
        memberPage
          .getByRole("region", { name: "Task details", exact: true })
          .getByRole("heading", { name: editedTitle, exact: true }),
      ).toBeVisible();
    });

    await test.step("revoking project access hides tasks, search results, and assignment notifications", async () => {
      await ownerPage.getByRole("tab", { name: "Project settings", exact: true }).click();
      await ownerPage.getByRole("button", { name: `Remove ${member.name}`, exact: true }).click();
      await expect(
        ownerPage
          .getByRole("region", { name: "Project sharing", exact: true })
          .getByRole("listitem")
          .filter({ has: ownerPage.getByText(member.name, { exact: true }) }),
      ).toHaveCount(0);
      await memberPage.reload();
      await expect(
        memberPage.getByRole("region", { name: "Task details", exact: true }),
      ).toHaveCount(0);
      const panel = await notifications(memberPage);
      await expect(
        panel.getByRole("heading", { name: "No notifications yet", exact: true }),
      ).toBeVisible();
      await expect(panel.getByRole("link")).toHaveCount(0);
      await memberPage.getByRole("button", { name: "Messages", exact: true }).click();
      await expect(panel).toBeHidden();
      await searchAbsent(memberPage, title);
    });

    await test.step("People picker mentions and thread replies produce navigable notifications", async () => {
      const channel = `Mentions ${suffix}`;
      const mentionBody = `Please review ${suffix}`;
      const replyBody = `Thread response ${suffix}`;
      await ownerPage.getByRole("button", { name: "Messages", exact: true }).click();
      await ownerPage.getByRole("button", { name: "Create channel", exact: true }).click();
      await ownerPage.getByLabel("Channel name", { exact: true }).fill(channel);
      await ownerPage.getByLabel("Add people (optional)", { exact: true }).fill(member.email);
      await ownerPage.getByRole("checkbox", { name: "Make this channel private" }).check();
      await ownerPage.getByRole("button", { name: "Create channel", exact: true }).last().click();
      const input = ownerPage.getByRole("textbox", { name: `Message #${channel}`, exact: true });
      await input.fill(`${mentionBody} @`);
      const picker = ownerPage.getByRole("region", {
        name: "Insert workspace reference",
        exact: true,
      });
      await picker.getByRole("button", { name: "People", exact: true }).click();
      await picker
        .getByRole("combobox", { name: "Search references", exact: true })
        .fill(member.name);
      await picker.getByRole("option", { name: member.name, exact: true }).click();
      await expect(input).toHaveValue(/@\[person:[0-9a-f-]{36}\]/);
      await input.press("Enter");
      await expect(input).toHaveValue("");
      await memberPage.reload();
      const panel = await notifications(memberPage);
      const mention = panel.getByRole("listitem").filter({ hasText: "Mentioned you" });
      await expect(mention).toContainText("Unread");
      await mention.getByRole("link").click();
      await expect(memberPage.getByRole("heading", { name: channel, exact: true })).toBeVisible();
      await memberPage
        .getByRole("article")
        .filter({ hasText: mentionBody })
        .getByRole("button", { name: "Reply in thread", exact: true })
        .click();
      await send(memberPage, "Reply in thread…", replyBody);
      await ownerPage.reload();
      const replies = await notifications(ownerPage);
      const reply = replies.getByRole("listitem").filter({ hasText: "Replied to your thread" });
      await expect(reply).toContainText("Unread");
      await reply.getByRole("link").click();
      await expect(
        ownerPage.getByRole("complementary", { name: "Thread", exact: true }),
      ).toContainText(replyBody);
    });
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});
