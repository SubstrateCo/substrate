import { createChannel } from "../messaging/test-support.js";
import { choose } from "../test-support/controls.js";
import { test } from "../test-support/fixture.js";
import { waitForRealtimeIdle } from "../test-support/realtime.js";
import { expect } from "@playwright/test";

test("Electron task edit cancel resets drafts and saved edits retain message provenance across navigation", async ({
  desktop,
}) => {
  test.setTimeout(120_000);
  await desktop.provision();
  const page = desktop.page;
  const apps = page.getByRole("navigation", { name: "Apps", exact: true });
  await apps.getByRole("button", { name: "Tasks", exact: true }).click();
  const newProject = page.getByRole("button", { name: "New project", exact: true });
  await expect(newProject).toHaveText("");
  await newProject.focus();
  await expect(page.getByRole("tooltip")).toHaveText("New project");
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Project name", { exact: true })).toBeFocused();
  await page.getByLabel("Project name", { exact: true }).fill("Desktop launch");
  await page.getByRole("button", { name: "Create project", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Desktop launch", exact: true })).toBeVisible();
  const projectURL = new URL(page.url());
  expect(projectURL.searchParams.get("projectId")).toBeTruthy();
  await waitForRealtimeIdle(page);
  await page.getByRole("tab", { name: "Settings", exact: true }).click();
  await expect(page.getByLabel("Project name", { exact: true })).toBeEnabled();
  await page.getByLabel("Project name", { exact: true }).fill("Discarded project name");
  await page.getByRole("button", { name: "Discard changes", exact: true }).click();
  await expect(page.getByLabel("Project name", { exact: true })).toHaveValue("Desktop launch");
  await page.getByLabel("Project description", { exact: true }).fill("Desktop validation project");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save changes", exact: true })).toBeDisabled();
  await expect(page.getByTitle("Desktop validation project", { exact: true })).toBeVisible();
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
  await creating.getByText("Linked to this message", { exact: true }).click();
  await creating
    .getByRole("button", { name: "Copy source text into description", exact: true })
    .click();
  await creating.getByLabel("Due date", { exact: true }).fill("2026-12-15");
  await creating.getByRole("button", { name: "Create task", exact: true }).click();
  await message.getByRole("link", { name: "Open Launch checklist", exact: true }).click();
  const details = page.getByRole("region", { name: "Task details", exact: true });
  await expect(
    details.getByRole("heading", { name: "Launch checklist", exact: true }),
  ).toBeVisible();
  const taskURL = page.url();
  const target = new URL(taskURL);
  expect(target.searchParams.get("projectId")).toBe(projectURL.searchParams.get("projectId"));
  expect(target.searchParams.get("taskId")).toBeTruthy();
  const edit = details.getByRole("button", { name: "Edit task", exact: true });
  await expect(edit).toHaveText("");
  await edit.focus();
  await expect(page.getByRole("tooltip")).toHaveText("Edit task");
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
