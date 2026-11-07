import { callMessaging } from "../../web/e2e/api.js";
import { provisionVerifiedAccount } from "../../web/e2e/auth.js";
import { Mailpit } from "../../web/e2e/mailpit.js";
import { test } from "./fixture.js";
import { expect, type Page } from "@playwright/test";

async function createChannel(page: Page, name: string) {
  await page
    .getByRole("complementary", { name: "Conversations", exact: true })
    .getByRole("button", { name: "Create channel", exact: true })
    .click();
  await page.getByLabel("Channel name", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Create channel", exact: true }).last().click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
}

async function choose(page: Page, label: string, option: string) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

test("Electron messaging cancels creation without mutations and keeps channel and thread drafts separate", async ({
  desktop,
}) => {
  test.setTimeout(120_000);
  await desktop.provision();
  const page = desktop.page;
  const sidebar = page.getByRole("complementary", { name: "Conversations", exact: true });
  await createChannel(page, "draft-first");
  const first = page.getByRole("textbox", { name: "Message #draft-first", exact: true });
  await first.fill("Root message");
  await first.press("Enter");
  const root = page.getByRole("article").filter({ hasText: "Root message" });
  await expect(root).toBeVisible();
  await first.fill("First channel draft");

  let creations = 0;
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      new URL(request.url()).pathname === "/api/v1/messaging/conversations"
    )
      creations++;
  });
  for (const kind of ["channel", "dm", "group"] as const) {
    const trigger = sidebar.getByRole("button", {
      name: kind === "channel" ? "Create channel" : "New message",
      exact: true,
    });
    await trigger.click();
    if (kind !== "channel")
      await page
        .getByRole("menuitem", {
          name: kind === "dm" ? "New direct message" : "New group message",
          exact: true,
        })
        .click();
    if (kind !== "dm")
      await page
        .getByLabel(kind === "channel" ? "Channel name" : "Group name (optional)", {
          exact: true,
        })
        .fill("Discard this creation");
    await page
      .getByLabel(kind === "channel" ? "Add people (optional)" : "To", { exact: true })
      .fill("nobody@example.test");
    await expect(first).toHaveCount(0);
    if (kind === "dm") await page.keyboard.press("Escape");
    else {
      const cancel = page.getByRole("button", { name: "Cancel", exact: true });
      await cancel.focus();
      await cancel.press("Enter");
    }
    await expect(page.getByRole("button", { name: "Cancel", exact: true })).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(first).toHaveValue("First channel draft");
  }
  expect(creations, "Cancel must not submit a conversation creation").toBe(0);
  const conversations = await callMessaging<unknown[]>(page, "listConversations");
  expect(conversations.error).toBeNull();
  expect(conversations.data).toHaveLength(1);

  await createChannel(page, "draft-second");
  const second = page.getByRole("textbox", { name: "Message #draft-second", exact: true });
  await expect(second).toHaveValue("");
  await second.fill("Second channel draft");
  await sidebar.getByRole("button", { name: "draft-first", exact: true }).click();
  await expect(first).toHaveValue("First channel draft");
  await root.hover();
  await root.getByRole("button", { name: "Reply in thread", exact: true }).click();
  const reply = page.getByRole("textbox", { name: "Reply in thread…", exact: true });
  await expect(reply).toHaveValue("");
  await reply.fill("Thread-only draft");
  await page.getByRole("button", { name: "Close thread", exact: true }).click();
  await sidebar.getByRole("button", { name: "draft-second", exact: true }).click();
  await expect(second).toHaveValue("Second channel draft");
  await sidebar.getByRole("button", { name: "draft-first", exact: true }).click();
  await root.hover();
  await root.getByRole("button", { name: "Reply in thread", exact: true }).click();
  await expect(reply).toHaveValue("Thread-only draft");
  await expect(first).toHaveValue("First channel draft");
  await reply.press("Enter");
  await expect(reply).toHaveValue("");
  await expect(
    page
      .getByRole("complementary", { name: "Thread", exact: true })
      .getByRole("article")
      .filter({ hasText: "Thread-only draft" }),
  ).toBeVisible();
  await expect(first).toHaveValue("First channel draft");
});

test("Electron task edit cancel resets drafts and saved edits retain message provenance across navigation", async ({
  desktop,
}) => {
  test.setTimeout(120_000);
  await desktop.provision();
  const page = desktop.page;
  const apps = page.getByRole("navigation", { name: "Apps", exact: true });
  await apps.getByRole("button", { name: "Tasks", exact: true }).click();
  await page.getByRole("button", { name: "New project", exact: true }).click();
  await expect(page.getByLabel("Project name", { exact: true })).toBeFocused();
  await page.getByLabel("Project name", { exact: true }).fill("Desktop launch");
  await page.getByRole("button", { name: "Create project", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Desktop launch", exact: true })).toBeVisible();
  const projectURL = new URL(page.url());
  expect(projectURL.searchParams.get("projectId")).toBeTruthy();
  await page.getByRole("tab", { name: "Project settings", exact: true }).click();
  const editProject = page.getByRole("button", { name: "Edit project", exact: true });
  await editProject.click();
  await expect(page.getByLabel("Project name", { exact: true })).toBeFocused();
  await page.getByLabel("Project name", { exact: true }).fill("Discarded project name");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(editProject).toBeFocused();
  await editProject.click();
  await expect(page.getByLabel("Project name", { exact: true })).toHaveValue("Desktop launch");
  await page.getByLabel("Project description", { exact: true }).fill("Desktop validation project");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(editProject).toBeFocused();
  await expect(page.getByText("Desktop validation project", { exact: true })).toBeVisible();
  await apps.getByRole("button", { name: "Messages", exact: true }).click();
  await createChannel(page, "launch-context");
  const composer = page.getByRole("textbox", { name: "Message #launch-context", exact: true });
  const source = "Prepare the desktop launch checklist.";
  await composer.fill(source);
  await composer.press("Enter");
  const message = page.getByRole("article").filter({ hasText: source });
  await expect(message).toBeVisible();
  await message.hover();
  await message.getByRole("button", { name: "Create task", exact: true }).click();
  await choose(page, "Destination project", "Desktop launch");
  const creating = page.getByRole("form", { name: "New task", exact: true });
  await creating.getByLabel("Task title", { exact: true }).fill("Launch checklist");
  await creating
    .getByRole("button", { name: "Copy source text into description", exact: true })
    .click();
  await creating.getByLabel("Due date", { exact: true }).fill("2026-12-15");
  await creating.getByRole("button", { name: "Create task", exact: true }).click();
  await page.getByRole("link", { name: "Open created task", exact: true }).click();
  const details = page.getByRole("region", { name: "Task details", exact: true });
  await expect(
    details.getByRole("heading", { name: "Launch checklist", exact: true }),
  ).toBeVisible();
  const taskURL = page.url();
  const target = new URL(taskURL);
  expect(target.searchParams.get("projectId")).toBe(projectURL.searchParams.get("projectId"));
  expect(target.searchParams.get("taskId")).toBeTruthy();
  const edit = details.getByRole("button", { name: "Edit task", exact: true });
  await edit.click();
  const editor = page.getByRole("form", { name: "Edit task", exact: true });
  await expect(editor.getByLabel("Task title", { exact: true })).toBeFocused();
  await editor.getByLabel("Task title", { exact: true }).fill("Discarded title");
  await editor.getByLabel("Task description", { exact: true }).fill("Discarded description");
  await editor.getByLabel("Due date", { exact: true }).fill("");
  await choose(page, "Priority", "Urgent");
  await editor.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(edit).toBeFocused();
  await expect(
    details.getByRole("heading", { name: "Launch checklist", exact: true }),
  ).toBeVisible();
  await expect(details.getByText(source, { exact: true }).first()).toBeVisible();
  await edit.click();
  await expect(editor.getByLabel("Task title", { exact: true })).toHaveValue("Launch checklist");
  await expect(editor.getByLabel("Task description", { exact: true })).toHaveValue(source);
  await expect(editor.getByLabel("Due date", { exact: true })).toHaveValue("2026-12-15");
  await expect(editor.getByRole("combobox", { name: "Priority", exact: true })).toContainText(
    "None",
  );
  await editor.getByLabel("Task title", { exact: true }).fill("Ready for launch");
  await editor.getByLabel("Task description", { exact: true }).fill("");
  await editor.getByLabel("Due date", { exact: true }).fill("");
  await choose(page, "Status", "Completed");
  await editor.getByRole("button", { name: "Save task", exact: true }).click();
  await expect(editor).toBeHidden();
  await page.reload();
  await expect(page).toHaveURL(taskURL);
  await expect(
    details.getByRole("heading", { name: "Ready for launch", exact: true }),
  ).toBeVisible();
  await expect(details.getByText("No description.", { exact: true })).toBeVisible();
  for (const value of ["Completed", "No due date"])
    await expect(details.getByRole("definition").filter({ hasText: value })).toBeVisible();
  const related = page.getByRole("region", { name: "Related context", exact: true });
  await expect(
    related.getByRole("link", { name: "Project: Desktop launch", exact: true }),
  ).toBeVisible();
  await related
    .getByRole("link", { name: "Created from a discussion · launch-context", exact: true })
    .click();
  const conversation = page.getByRole("region", { name: "launch-context", exact: true });
  await expect(conversation.getByLabel("Linked message", { exact: true })).toContainText(source);
  const sourceURL = page.url();
  await conversation.getByRole("link", { name: "Open Ready for launch", exact: true }).click();
  await expect(page).toHaveURL(taskURL);
  await expect(
    details.getByRole("heading", { name: "Ready for launch", exact: true }),
  ).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(sourceURL);
  await expect(conversation.getByLabel("Linked message", { exact: true })).toContainText(source);
  await page.goForward();
  await expect(page).toHaveURL(taskURL);
  await expect(
    details.getByRole("heading", { name: "Ready for launch", exact: true }),
  ).toBeVisible();

  await page.keyboard.press("Control+k");
  const search = page.getByRole("region", { name: "Workspace search", exact: true });
  const query = page.getByRole("combobox", { name: "Search workspace", exact: true });
  await query.fill("Ready for launch");
  await search.getByRole("button", { name: "Tasks", exact: true }).click();
  await search
    .getByRole("button", { name: "Find related records for Ready for launch", exact: true })
    .click();
  await expect(query).toBeFocused();
  await expect(query).toHaveValue("");
  await expect(
    search.getByRole("link", { name: `message · ${source}`, exact: true }),
  ).toBeVisible();
  await search.getByRole("button", { name: "Search all records", exact: true }).click();
  await query.fill("Ready for launch");
  await query.press("Escape");
  await expect(search).toBeHidden();
  await expect(query).toBeFocused();
  await expect(query).toHaveValue("Ready for launch");
  await page.keyboard.press("Control+k");
  await expect(search).toBeVisible();
  await expect(query).toHaveValue("Ready for launch");
});

test("Electron invitation pagination supports keyboard and pointer without changing the route", async ({
  desktop,
  playwright,
}) => {
  test.setTimeout(120_000);
  await desktop.provision();
  const page = desktop.page;
  await page.goto(new URL("/settings/organization", desktop.rendererOrigin).href);
  const email = page.getByLabel("Email", { exact: true });
  await email.fill(desktop.member.email);
  await choose(page, "Role", "Admin");
  const invitation = page.getByRole("row").filter({ hasText: desktop.member.email });
  await page.getByRole("button", { name: "Send invitation", exact: true }).click();
  await expect(invitation).toContainText("admin");
  await expect(invitation).toContainText("pending");
  // A duplicate invitation exercises a real server rejection through native auth transport.
  await page.getByRole("button", { name: "Send invitation", exact: true }).click();
  await expect(
    page.getByText("We couldn’t update this invitation. Check the email and try again.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(email).toHaveValue(desktop.member.email);
  await expect(page.getByRole("combobox", { name: "Role", exact: true })).toHaveText("Admin");
  await invitation.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(invitation).toContainText("canceled");
  await page.getByRole("button", { name: "Send invitation", exact: true }).click();
  const pending = invitation.filter({ hasText: "pending" });
  await expect(pending).toHaveCount(1);
  await expect(pending).toContainText("admin");

  const inviter = await playwright.request.newContext({ baseURL: desktop.rendererOrigin });
  try {
    await provisionVerifiedAccount({ request: inviter }, new Mailpit(inviter), desktop.member);
    for (let index = 1; index <= 11; index++) {
      const created = await inviter.post("/api/auth/organization/create", {
        headers: { origin: desktop.rendererOrigin },
        data: {
          name: `Pagination workspace ${index}`,
          slug: `pagination-${desktop.suffix}-${index}`,
        },
      });
      expect(created.ok(), `Create invitation workspace ${index}`).toBe(true);
      const organization: { id: string } = await created.json();
      const invited = await inviter.post("/api/auth/organization/invite-member", {
        headers: { origin: desktop.rendererOrigin },
        data: { organizationId: organization.id, email: desktop.owner.email, role: "member" },
      });
      expect(invited.ok(), `Invite the desktop user to workspace ${index}`).toBe(true);
    }
  } finally {
    await inviter.dispose();
  }

  await page.goto(new URL("/settings/user/invitations", desktop.rendererOrigin).href);
  const route = page.url();
  const table = page.getByRole("table", { name: "Your invitations", exact: true });
  const rows = table
    .getByRole("row")
    .filter({ has: page.getByRole("link", { name: "Review invitation", exact: true }) });
  await expect(rows).toHaveCount(10);
  const firstPage = await rows.allTextContents();
  const pagination = page.getByRole("navigation", {
    name: "Your invitations pagination",
    exact: true,
  });
  const previous = pagination.getByRole("button", { name: "Go to previous page", exact: true });
  const next = pagination.getByRole("button", { name: "Go to next page", exact: true });
  const first = pagination.getByRole("button", { name: "Go to page 1", exact: true });
  const second = pagination.getByRole("button", { name: "Go to page 2", exact: true });
  await expect(previous).toBeDisabled();
  await expect(first).toHaveAttribute("aria-current", "page");
  await next.focus();
  await next.press("Enter");
  await expect(rows).toHaveCount(1);
  expect(firstPage).not.toContain(await rows.first().textContent());
  await expect(next).toBeDisabled();
  await expect(previous).toBeEnabled();
  await expect(second).toHaveAttribute("aria-current", "page");
  await expect(page).toHaveURL(route);
  await previous.click();
  await expect(rows).toHaveCount(10);
  await expect(first).toHaveAttribute("aria-current", "page");
  await second.focus();
  await second.press("Space");
  await expect(rows).toHaveCount(1);
  await expect(second).toHaveAttribute("aria-current", "page");
  await first.click();
  await expect(rows).toHaveCount(10);
  expect(await rows.allTextContents()).toEqual(firstPage);
  await expect(previous).toBeDisabled();
  await expect(page).toHaveURL(route);
});
