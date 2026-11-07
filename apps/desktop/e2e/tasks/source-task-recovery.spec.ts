import { test } from "../test-support/fixture.js";
import { failRequestsAt } from "../test-support/request-failure.js";
import { expect } from "@playwright/test";

test("failed source-task submission keeps the draft and retry creates one linked task", async ({
  desktop,
}) => {
  test.setTimeout(120_000);
  await desktop.provision();
  const page = desktop.page;
  const suffix = desktop.suffix.slice(0, 8);
  const project = `Recovery ${suffix}`;
  const title = `Retry task ${suffix}`;
  const channel = `recovery-${suffix}`;
  await page.clock.install();
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
  const failure = await page.evaluateHandle(failRequestsAt, "/api/v1/tasks/project");
  await page.clock.fastForward(5000);
  const source = page.getByRole("region", { name: "Create task from message", exact: true });
  const stale = source.getByRole("status").filter({ hasText: "Project may be out of date." });
  const toast = page.locator("[data-sonner-toast]").filter({ hasText: "Couldn’t refresh project" });
  await expect(stale).toBeVisible();
  await expect(toast).toBeVisible();
  await expect(form.getByLabel("Task title", { exact: true })).toHaveValue(title);
  await expect(form.getByLabel("Task description", { exact: true })).toHaveValue(
    "Do not lose my draft.",
  );
  await failure.evaluate((control) => control.recover());
  await toast.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(stale).toBeHidden();
  const submission = await page.evaluateHandle(() => {
    const original = window.fetch;
    const requestIds: string[] = [];
    window.fetch = Object.assign(async (...args: Parameters<typeof window.fetch>) => {
      const [input, init] = args;
      const url = new URL(input instanceof Request ? input.url : String(input), location.href);
      if (url.pathname === "/api/v1/context/source-tasks") {
        const request = input instanceof Request ? input.clone() : new Request(url, init);
        const body: { requestId: string } = await request.json();
        requestIds.push(body.requestId);
        if (requestIds.length === 1) throw new TypeError("Failed to fetch");
      }
      return original(...args);
    }, original);
    return { requestIds: () => requestIds };
  });
  await form.getByRole("button", { name: "Create task", exact: true }).click();
  await expect(form.getByRole("alert")).toBeVisible();
  expect(await submission.evaluate((control) => control.requestIds())).toHaveLength(1);
  await expect(form.getByLabel("Task title", { exact: true })).toHaveValue(title);
  await expect(form.getByLabel("Task description", { exact: true })).toHaveValue(
    "Do not lose my draft.",
  );
  await form.getByRole("button", { name: "Create task", exact: true }).click();
  await expect(page.getByText("Task created and linked.", { exact: true })).toBeVisible();
  const requestIds = await submission.evaluate((control) => control.requestIds());
  expect(requestIds).toHaveLength(2);
  expect(requestIds[0]).toBeTruthy();
  expect(requestIds[1], "Retry retains the original request's idempotency key").toBe(requestIds[0]);
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
  await page.evaluate(() => {
    const original = window.fetch;
    window.fetch = Object.assign(async (...args: Parameters<typeof window.fetch>) => {
      const input = args[0];
      const url = new URL(input instanceof Request ? input.url : String(input), location.href);
      if (url.pathname === "/api/v1/tasks/project") {
        return Response.json(
          { success: false, error: { code: "FORBIDDEN", message: "Project access denied." } },
          { status: 403 },
        );
      }
      return original(...args);
    }, original);
  });
  await page.getByRole("combobox", { name: "Destination project", exact: true }).click();
  await page.getByRole("option", { name: project, exact: true }).click();
  await expect(source.getByRole("alert")).toBeVisible();
  await expect(form).toBeHidden();
  await source.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(source).toBeHidden();
});
