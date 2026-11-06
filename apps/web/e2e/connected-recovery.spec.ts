import { provisionVerifiedAccount } from "./auth";
import { Mailpit } from "./mailpit";
import { provisionWorkspace } from "./organizations";
import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";

test("failed source-task submission keeps the draft and retry creates one linked task", async ({
  page,
  request,
}) => {
  const suffix = randomUUID().slice(0, 8);
  const project = `Recovery ${suffix}`;
  const title = `Retry task ${suffix}`;
  const channel = `recovery-${suffix}`;
  await page.clock.install();
  await provisionVerifiedAccount(page, new Mailpit(request), {
    name: "Recovery",
    email: `recovery-${suffix}@example.test`,
    password: `Recovery-${randomUUID()}!`,
  });
  await provisionWorkspace(page, project, `recovery-${suffix}`);
  const apps = page.getByRole("navigation", { name: "Apps" });
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
  await composer.fill("Keep this source context");
  await composer.press("Enter");
  const message = page.getByRole("article").filter({ hasText: "Keep this source context" });
  await expect(message).toBeVisible();
  const conversationUrl = page.url();
  await message.hover();
  await message.getByRole("button", { name: "Create task", exact: true }).click();
  await page.getByRole("combobox", { name: "Destination project", exact: true }).click();
  await page.getByRole("option", { name: project, exact: true }).click();
  const form = page.getByRole("form", { name: "New task", exact: true });
  await form.getByLabel("Task title", { exact: true }).fill(title);
  await form.getByLabel("Task description", { exact: true }).fill("Do not lose my draft.");
  await page.route(
    "**/api/v1/tasks/project?*",
    (route) =>
      route.fulfill({
        status: 500,
        json: {
          success: false,
          error: { code: "INTERNAL_ERROR", message: "Temporary project failure." },
        },
      }),
    { times: 1 },
  );
  await page.clock.fastForward(5000);
  const source = page.getByRole("region", { name: "Create task from message", exact: true });
  await expect(source.getByRole("alert")).toBeVisible();
  await expect(form.getByLabel("Task title", { exact: true })).toHaveValue(title);
  await expect(form.getByLabel("Task description", { exact: true })).toHaveValue(
    "Do not lose my draft.",
  );
  await source.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(source.getByRole("alert")).toHaveCount(0);
  let failed = false;
  await page.route("**/*", (route) => {
    if (
      !failed &&
      route.request().method() === "POST" &&
      route.request().postData()?.includes(title)
    ) {
      failed = true;
      return route.abort("failed");
    }
    return route.continue();
  });
  await form.getByRole("button", { name: "Create task", exact: true }).click();
  await expect(form.getByRole("alert")).toBeVisible();
  expect(failed).toBe(true);
  await expect(form.getByLabel("Task title", { exact: true })).toHaveValue(title);
  await expect(form.getByLabel("Task description", { exact: true })).toHaveValue(
    "Do not lose my draft.",
  );
  await form.getByRole("button", { name: "Create task", exact: true }).click();
  await expect(page.getByText("Task created and linked.", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Open created task", exact: true }).click();
  await expect(
    page
      .getByRole("region", { name: "Project tasks" })
      .getByRole("button")
      .filter({ has: page.getByText(title, { exact: true }) }),
  ).toHaveCount(1);
  await expect(
    page
      .getByRole("region", { name: "Related context" })
      .getByRole("link", { name: `Created from a discussion · ${channel}` }),
  ).toBeVisible();

  await page.goto(conversationUrl);
  await message.hover();
  await message.getByRole("button", { name: "Create task", exact: true }).click();
  await page.route("**/api/v1/tasks/project?*", (route) =>
    route.fulfill({
      status: 403,
      json: { success: false, error: { code: "FORBIDDEN", message: "Project access denied." } },
    }),
  );
  await page.getByRole("combobox", { name: "Destination project", exact: true }).click();
  await page.getByRole("option", { name: project, exact: true }).click();
  await expect(source.getByRole("alert")).toBeVisible();
  await source.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(source).toBeHidden();
});
