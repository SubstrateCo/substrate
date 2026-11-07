import { test } from "../test-support/fixture.js";
import { expect, type ElectronApplication, type Locator } from "@playwright/test";

async function copyAndReset(button: Locator, app: ElectronApplication) {
  const width = (await button.boundingBox())!.width;
  await button.click();
  await expect(button.locator("[data-copy-icon=check]")).toHaveCSS("opacity", "1");
  await expect(button.locator("[data-copy-icon=copy]")).toHaveCSS("opacity", "0");
  const copied = await app.evaluate(({ clipboard }) => clipboard.readText());
  expect((await button.boundingBox())!.width).toBeCloseTo(width, 0);
  await expect(button.locator("[data-copy-icon=copy]")).toHaveCSS("opacity", "1");
  await expect(button.locator("[data-copy-icon=check]")).toHaveCSS("opacity", "0");
  return copied;
}

test("desktop messages create linked tasks with OS navigation and source context", async ({
  desktop,
}) => {
  test.setTimeout(120_000);
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
  const projectURL = page.url();
  const copyProject = page.getByRole("button", { name: "Copy project link", exact: true });
  await page.evaluate(() => {
    Object.defineProperty(navigator.clipboard, "writeText", {
      configurable: true,
      value: () => Promise.reject(new Error("Clipboard unavailable")),
    });
  });
  await copyProject.click();
  await expect(page.getByRole("status").filter({ hasText: "Couldn't copy link" })).toBeVisible();
  await expect(copyProject.locator("[data-copy-icon=check]")).toHaveCSS("opacity", "0");
  await page.evaluate(() => Reflect.deleteProperty(navigator.clipboard, "writeText"));
  expect(await copyAndReset(copyProject, desktop.app)).toBe(projectURL);
  await expect(page.getByText("Couldn't copy link", { exact: true })).toHaveCount(0);
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
  const messageURL = new URL(
    await copyAndReset(
      message.getByRole("button", { name: "Copy message link", exact: true }),
      desktop.app,
    ),
  );
  const conversationURL = new URL(page.url());
  expect(messageURL.origin).toBe(conversationURL.origin);
  expect(messageURL.pathname).toBe("/dashboard");
  for (const key of ["workspaceId", "conversationId"])
    expect(messageURL.searchParams.get(key)).toBe(conversationURL.searchParams.get(key));
  expect(messageURL.searchParams.get("messageId")).toBeTruthy();
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
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await copyAndReset(
      form.getByRole("button", { name: "Copy source text into description", exact: true }),
      desktop.app,
    ),
  ).toBe(messageURL.href);
  await expect(form.getByLabel("Task description", { exact: true })).toHaveValue(source);
  await page.emulateMedia({ reducedMotion: "no-preference" });
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
  expect(
    await copyAndReset(
      details.getByRole("button", { name: "Copy task link", exact: true }),
      desktop.app,
    ),
  ).toBe(page.url());
  const target = new URL(page.url());
  await desktop.openPath(`${target.pathname}${target.search}`);
  await expect(details.getByRole("heading", { name: task, exact: true })).toBeVisible();
  await expect(details.getByText(source, { exact: true }).first()).toBeVisible();
  await page
    .getByRole("region", { name: "Related context", exact: true })
    .getByRole("link", { name: `Created from a discussion · ${channel}`, exact: true })
    .click();
  await expect(message).toBeVisible();
  await desktop.openPath(`${messageURL.pathname}${messageURL.search}`);
  await expect(
    page
      .getByRole("region", { name: channel, exact: true })
      .getByLabel("Linked message", { exact: true }),
  ).toContainText(source);
});
