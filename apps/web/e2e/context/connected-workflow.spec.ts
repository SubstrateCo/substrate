import { provisionVerifiedAccount } from "../test-support/auth";
import { Mailpit } from "../test-support/mailpit";
import { provisionWorkspace } from "../test-support/organizations";
import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

async function choose(page: Page, label: string, option: string) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

test("connected work preserves source, links, references, and stable navigation", async ({
  page,
  request,
  context,
}) => {
  test.setTimeout(240_000);
  const suffix = randomUUID().slice(0, 8);
  const account = {
    name: `Connected ${suffix}`,
    email: `connected-${suffix}@example.test`,
    password: `Connected-${randomUUID()}!`,
  };
  const project = `Launch ${suffix}`;
  const task = `Follow up ${suffix}`;
  const channel = `connected-${suffix}`;
  const source = `Please prepare the launch checklist ${suffix}.`;
  const reply = `Reply with the rollout schedule ${suffix}.`;
  await provisionVerifiedAccount(page, new Mailpit(request), account);
  await provisionWorkspace(page, `Connected ${suffix}`, `connected-${suffix}`);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  page.on("console", (message) => {
    if (message.type() === "error") console.log("Browser error:", message.text());
  });
  const apps = page.getByRole("navigation", { name: "Apps", exact: true });
  const openConversation = async () => {
    const url = new URL(sourceUrl);
    url.searchParams.delete("messageId");
    await page.goto(url.href);
    await expect(page.getByRole("article").filter({ hasText: source })).toBeVisible();
  };

  await test.step("create a project and source conversation through the app", async () => {
    await apps.getByRole("button", { name: "Tasks", exact: true }).click();
    await page.getByRole("button", { name: "New project", exact: true }).click();
    await page.getByLabel("Project name", { exact: true }).fill(project);
    await page
      .getByLabel("Project description", { exact: true })
      .fill("Connected workflow verification");
    await page.getByRole("button", { name: "Create project", exact: true }).click();
    await expect(page.getByRole("heading", { name: project, exact: true })).toBeVisible();
    await apps.getByRole("button", { name: "Messages", exact: true }).click();
    await page
      .getByRole("complementary", { name: "Conversations" })
      .getByRole("button", { name: "Create channel", exact: true })
      .click();
    await page.getByLabel("Channel name", { exact: true }).fill(channel);
    await page.getByRole("button", { name: "Create channel", exact: true }).last().click();
    await expect(page.getByRole("heading", { name: channel, exact: true })).toBeVisible();
    const composer = page.getByRole("textbox", { name: `Message #${channel}`, exact: true });
    await composer.fill(source);
    await composer.press("Enter");
    await expect(composer).toHaveValue("");
    await expect(page.getByRole("article").filter({ hasText: source })).toBeVisible();
  });

  let taskUrl = "";
  let sourceUrl = "";
  await test.step("create a fully populated task from the message", async () => {
    const message = page
      .getByRole("region", { name: channel, exact: true })
      .getByRole("article")
      .filter({ hasText: source });
    await message.hover();
    await message.getByRole("button", { name: "Create task", exact: true }).click();
    await choose(page, "Destination project", project);
    const form = page.getByRole("form", { name: "New task", exact: true });
    await form.getByLabel("Task title", { exact: true }).fill(task);
    await form
      .getByRole("button", { name: "Copy source text into description", exact: true })
      .click();
    await expect(form.getByLabel("Task description", { exact: true })).toHaveValue(source);
    await choose(page, "Status", "In Progress");
    await choose(page, "Priority", "High");
    await choose(page, "Assignee", account.name);
    await form.getByLabel("Due date", { exact: true }).fill("2026-12-15");
    await form.getByRole("button", { name: "Create task", exact: true }).click();
    await expect(
      page
        .getByRole("region", { name: "Create task from message", exact: true })
        .getByRole("status")
        .filter({ hasText: "Task created and linked." }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Open created task", exact: true }).click();
    const details = page.getByRole("region", { name: "Task details", exact: true });
    await expect(details.getByRole("heading", { name: task, exact: true })).toBeVisible();
    await expect(details.getByText(source, { exact: true }).first()).toBeVisible();
    for (const value of ["In Progress", "high", account.name, "2026-12-15"]) {
      await expect(details.getByRole("definition").filter({ hasText: value })).toBeVisible();
    }
    const related = page.getByRole("region", { name: "Related context", exact: true });
    await expect(
      related.getByRole("link", { name: `Project: ${project}`, exact: true }),
    ).toBeVisible();
    const origin = related.getByRole("link", {
      name: `Created from a discussion · ${channel}`,
      exact: true,
    });
    await expect(origin).toBeVisible();
    sourceUrl = new URL((await origin.getAttribute("href"))!, page.url()).href;
    await expect(page.getByRole("region", { name: "Task activity", exact: true })).toContainText(
      account.name,
    );
    taskUrl = page.url();
    const target = new URL(taskUrl);
    expect(target.pathname).toBe("/tasks");
    for (const key of ["workspaceId", "projectId", "taskId"])
      expect(target.searchParams.get(key)).toBeTruthy();
    await page.reload();
    await expect(details.getByRole("heading", { name: task, exact: true })).toBeVisible();
    await expect(page).toHaveURL(taskUrl);
    await expect(origin).toBeVisible();
    await origin.click();
    await expect
      .soft(
        page
          .getByRole("region", { name: channel, exact: true })
          .getByLabel("Linked message", { exact: true }),
        "Source deep link opens its message",
      )
      .toContainText(source, { timeout: 5_000 });
    await openConversation();
  });

  await test.step("link and unlink existing work without deleting provenance", async () => {
    const message = page.getByRole("article").filter({ hasText: source });
    await message.hover();
    await message.getByRole("button", { name: "Link existing work", exact: true }).click();
    const linking = page.getByRole("region", { name: "Link existing work", exact: true });
    await linking.getByLabel("Search work to link", { exact: true }).fill(task);
    const attached = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/v1/context/links" &&
        response.request().method() === "POST",
    );
    await linking.getByRole("button", { name: `Link ${task}`, exact: true }).click();
    expect(
      await (await attached).json(),
      "Commands without a payload return explicit null data",
    ).toEqual({ success: true, data: null });
    await expect(message.getByText("Linked work", { exact: true })).toBeVisible();
    const detached = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/v1/context/links" &&
        response.request().method() === "DELETE",
    );
    await message.getByRole("button", { name: `Unlink ${task}`, exact: true }).click();
    expect(await (await detached).json()).toEqual({ success: true, data: null });
    await expect(message.getByText("Linked work", { exact: true })).toBeHidden();
    await expect(message.getByText("Created here", { exact: true })).toBeVisible();
    await expect(message.getByRole("link", { name: `Open ${task}`, exact: true })).toBeVisible();
    await expect(message.getByText("In Progress", { exact: true })).toBeVisible();
    await page.reload();
    await expect(message.getByText("Created here", { exact: true })).toBeVisible();
    await expect(message.getByText("Linked work", { exact: true })).toBeHidden();
  });

  await test.step("reply links resolve the exact thread message after reload", async () => {
    const message = page.getByRole("article").filter({ hasText: source });
    await message.hover();
    await message.getByRole("button", { name: "Reply in thread", exact: true }).click();
    const thread = page.getByRole("complementary", { name: "Thread", exact: true });
    const composer = thread.getByRole("textbox", { name: "Reply in thread…", exact: true });
    await composer.fill(reply);
    await composer.press("Enter");
    await expect(composer).toHaveValue("");
    const response = thread.getByRole("article").filter({ hasText: reply });
    await response.hover();
    await response.getByRole("button", { name: "Copy message link", exact: true }).click();
    const replyUrl = await page.evaluate(() => navigator.clipboard.readText());
    expect(new URL(replyUrl).searchParams.get("messageId")).toBeTruthy();
    expect(replyUrl).not.toBe(sourceUrl);
    await page.goto(replyUrl);
    await expect.soft(thread, "Reply deep link opens its thread").toBeVisible({ timeout: 5_000 });
    await expect
      .soft(
        thread.getByLabel("Linked message", { exact: true }),
        "Reply deep link highlights the reply",
      )
      .toContainText(reply, { timeout: 5_000 });
    await page.reload();
    await expect
      .soft(
        thread.getByLabel("Linked message", { exact: true }),
        "Reply deep link survives refresh",
      )
      .toContainText(reply, { timeout: 5_000 });
    await openConversation();
  });

  await test.step("insert task and project references with pointer and keyboard", async () => {
    const composer = page.getByRole("textbox", { name: `Message #${channel}`, exact: true });
    await composer.fill(`References ${suffix} @`);
    const picker = page.getByRole("region", { name: "Insert workspace reference", exact: true });
    await picker.getByRole("combobox", { name: "Search references", exact: true }).fill(task);
    await picker.getByRole("option", { name: task, exact: true }).click();
    await composer.press("End");
    await composer.pressSequentially("@");
    await picker.getByRole("button", { name: "Projects", exact: true }).click();
    const search = picker.getByRole("combobox", { name: "Search references", exact: true });
    await search.fill(project);
    await expect(picker.getByRole("option", { name: project, exact: true })).toBeVisible();
    await search.press("ArrowDown");
    await search.press("ArrowUp");
    await search.press("Enter");
    await expect(picker).toBeHidden();
    await expect(composer).toBeFocused();
    await composer.press("Enter");
    await expect(composer).toHaveValue("");
    const message = page.getByRole("article").filter({ hasText: `References ${suffix}` });
    await expect(message.getByRole("link", { name: task, exact: true }).first()).toBeVisible();
    await expect(message.getByRole("link", { name: project, exact: true }).first()).toBeVisible();
    await page.reload();
    await message.getByRole("link", { name: project, exact: true }).first().click();
    await page.locator("summary").filter({ hasText: "Project discussions" }).click();
    await expect(
      page.getByRole("region", { name: "Project discussions", exact: true }),
    ).toContainText(`References ${suffix}`);
    await page
      .getByRole("region", { name: "Project tasks", exact: true })
      .getByRole("button")
      .filter({ has: page.getByText(task, { exact: true }) })
      .click();
    await expect(page).toHaveURL(taskUrl);
    await expect(page.getByRole("heading", { name: task, exact: true })).toBeVisible();
  });

  await test.step("workspace search resolves the task and narrow layouts keep context usable", async () => {
    await page.keyboard.press("Control+k");
    const search = page.getByRole("region", { name: "Workspace search", exact: true });
    await page.getByRole("combobox", { name: "Search workspace", exact: true }).fill(task);
    await search.getByRole("button", { name: "Tasks", exact: true }).click();
    await expect(search.getByRole("link", { name: `task · ${task}`, exact: true })).toBeVisible();
    await search
      .getByRole("button", { name: `Find related records for ${task}`, exact: true })
      .click();
    await expect(
      search.getByRole("link", { name: `message · ${source}`, exact: true }),
    ).toBeVisible();
    const searchInput = page.getByRole("combobox", { name: "Search workspace", exact: true });
    await expect(searchInput).toHaveValue("");
    await expect(searchInput).toBeFocused();
    await page.keyboard.type("abc");
    await expect(searchInput).toHaveValue("abc");
    await searchInput.fill("");
    await search
      .getByRole("button", { name: `Find related records for ${source}`, exact: true })
      .click();
    await expect(search.getByRole("link", { name: `task · ${task}`, exact: true })).toBeVisible();
    await search.getByRole("button", { name: "Search all records", exact: true }).click();
    await page.getByRole("combobox", { name: "Search workspace", exact: true }).fill(task);
    await search.getByRole("button", { name: "Tasks", exact: true }).click();
    await search.getByRole("link", { name: `task · ${task}`, exact: true }).click();
    await expect(page).toHaveURL(taskUrl);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole("heading", { name: task, exact: true })).toBeVisible();
    const origin = page
      .getByRole("region", { name: "Related context", exact: true })
      .getByRole("link", { name: `Created from a discussion · ${channel}`, exact: true });
    await origin.click();
    await expect
      .soft(
        page
          .getByRole("complementary", { name: "Thread", exact: true })
          .getByLabel("Linked message", { exact: true }),
        "Narrow source deep link opens its message",
      )
      .toContainText(source, { timeout: 5_000 });
    await openConversation();
    await page.getByRole("textbox", { name: `Message #${channel}`, exact: true }).fill("@");
    const picker = page.getByRole("region", { name: "Insert workspace reference", exact: true });
    await picker.getByRole("combobox", { name: "Search references", exact: true }).fill(task);
    await expect(picker.getByRole("option", { name: task, exact: true })).toBeVisible();
    await picker.getByRole("combobox", { name: "Search references", exact: true }).press("Escape");
    await expect(picker).toBeHidden();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      "Narrow layout has no page-level horizontal overflow",
    ).toBe(true);
  });
});
