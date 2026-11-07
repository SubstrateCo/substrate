import { test } from "../test-support/fixture.js";
import { expect } from "@playwright/test";

test("desktop messages create linked tasks with OS navigation and source context", async ({
  desktop,
}) => {
  await desktop.provision();
  const { page, suffix } = desktop;
  const project = `Desktop project ${suffix.slice(0, 8)}`;
  const channel = `desktop-${suffix.slice(0, 8)}`;
  const task = `Desktop follow-up ${suffix.slice(0, 8)}`;
  const source = `Prepare the desktop launch checklist ${suffix}.`;
  const apps = page.getByRole("navigation", { name: "Apps", exact: true });
  await apps.getByRole("button", { name: "Tasks", exact: true }).click();
  await page.getByRole("button", { name: "New project", exact: true }).click();
  await page.getByLabel("Project name", { exact: true }).fill(project);
  await page.getByRole("button", { name: "Create project", exact: true }).click();
  await expect(page.getByRole("heading", { name: project, exact: true })).toBeVisible();
  await apps.getByRole("button", { name: "Messages", exact: true }).click();
  await page
    .getByRole("complementary", { name: "Conversations" })
    .getByRole("button", { name: "Create channel", exact: true })
    .click();
  await page.getByLabel("Channel name", { exact: true }).fill(channel);
  await page.getByRole("button", { name: "Create channel", exact: true }).last().click();
  const composer = page.getByRole("textbox", { name: `Message #${channel}`, exact: true });
  await composer.fill(source);
  await composer.press("Enter");
  const message = page
    .getByRole("region", { name: channel, exact: true })
    .getByRole("article")
    .filter({ hasText: source });
  await expect(message).toBeVisible();
  await message.hover();
  await message.getByRole("button", { name: "Create task", exact: true }).click();
  await page.getByRole("combobox", { name: "Destination project", exact: true }).click();
  await page.getByRole("option", { name: project, exact: true }).click();
  const form = page.getByRole("form", { name: "New task", exact: true });
  await expect(form.getByRole("heading", { name: "New task", exact: true })).toHaveCount(0);
  const sourcePreview = form.getByRole("group", { name: "Source message", exact: true });
  await expect(sourcePreview.getByText(source, { exact: true })).toBeHidden();
  await sourcePreview.getByText("Linked to this message", { exact: true }).click();
  await expect(sourcePreview.getByText(source, { exact: true })).toBeVisible();
  await expect(form).toContainText("The source message stays private");
  await form.getByLabel("Task title", { exact: true }).fill(task);
  await form
    .getByRole("button", { name: "Copy source text into description", exact: true })
    .click();
  await expect(form.getByLabel("Task description", { exact: true })).toHaveValue(source);
  await form.getByRole("combobox", { name: "Priority", exact: true }).click();
  await page.getByRole("option", { name: "High", exact: true }).click();
  await form.getByLabel("Due date", { exact: true }).fill("2026-12-15");
  await form.getByLabel("Task title", { exact: true }).press("ControlOrMeta+Enter");
  await expect(
    page.getByRole("region", { name: "Create task from message", exact: true }).getByRole("status"),
  ).toContainText("Task created and linked");
  await page.getByRole("link", { name: "Open created task", exact: true }).click();
  const details = page.getByRole("region", { name: "Task details", exact: true });
  await expect(details.getByRole("heading", { name: task, exact: true })).toBeVisible();
  await expect(details).toContainText(/high/i);
  await expect(details).toContainText("2026-12-15");
  const target = new URL(page.url());
  await desktop.openPath(`${target.pathname}${target.search}`);
  await expect(details.getByRole("heading", { name: task, exact: true })).toBeVisible();
  await expect(details.getByText(source, { exact: true }).first()).toBeVisible();
  await page
    .getByRole("region", { name: "Related context", exact: true })
    .getByRole("link", { name: `Created from a discussion · ${channel}`, exact: true })
    .click();
  await expect(message).toBeVisible();
});
