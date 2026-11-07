import { provisionVerifiedAccount } from "../../../web/e2e/test-support/auth.js";
import { provisionMember } from "../../../web/e2e/test-support/organizations.js";
import { createChannel } from "../messaging/test-support.js";
import { test } from "../test-support/fixture.js";
import { expect, type Locator } from "@playwright/test";

async function fits(container: Locator, controls: Locator) {
  await expect(container).toBeVisible();
  await expect(controls.first()).toBeVisible();
  await expect
    .poll(() =>
      controls.evaluateAll((elements) =>
        elements.every((element) => {
          const box = element.getBoundingClientRect();
          return box.width > 0 && box.left >= 0 && box.right <= innerWidth + 1;
        }),
      ),
    )
    .toBe(true);
  expect(
    await container.evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
  ).toBe(true);
}

for (const scenario of [
  { kind: "channel", width: 1024, height: 768 },
  { kind: "channel", width: 320, height: 568 },
  { kind: "dm", width: 375, height: 812 },
] as const) {
  test(`source task builder in a ${scenario.kind} thread fits ${scenario.width}px and preserves the conversation`, async ({
    desktop,
    browser,
  }) => {
    test.setTimeout(120_000);
    await desktop.provision();
    const { page } = desktop;
    let taskCreations = 0;
    page.on("request", (request) => {
      if (
        request.method() === "POST" &&
        new URL(request.url()).pathname === "/api/v1/context/source-tasks"
      )
        taskCreations++;
    });
    const project = `Polish ${"long-project-name-".repeat(8)}`;
    await desktop.openPath("/tasks");
    await page.getByRole("button", { name: "New project", exact: true }).click();
    await page.getByLabel("Project name", { exact: true }).fill(project);
    await page.getByRole("button", { name: "Create project", exact: true }).click();
    await expect(page.getByRole("heading", { name: project, exact: true })).toBeVisible();

    if (scenario.kind === "dm") {
      const memberContext = await browser.newContext({ baseURL: desktop.rendererOrigin });
      try {
        const member = await memberContext.newPage();
        await provisionVerifiedAccount(member, desktop.mailpit, desktop.member);
        await provisionMember(desktop.browser, member, desktop.member.email);
      } finally {
        await memberContext.close();
      }
    }
    await page
      .getByRole("navigation", { name: "Apps", exact: true })
      .getByRole("button", { name: "Messages", exact: true })
      .click();
    if (scenario.kind === "channel") {
      await createChannel(page, "product-polish");
    } else {
      await page
        .getByRole("complementary", { name: "Conversations", exact: true })
        .getByRole("button", { name: "New message", exact: true })
        .click();
      await page.getByRole("menuitem", { name: "New direct message", exact: true }).click();
      await page.getByLabel("To", { exact: true }).fill(desktop.member.email);
      await page.getByRole("button", { name: "Start conversation", exact: true }).click();
    }
    const composer = page.getByRole("textbox", {
      name:
        scenario.kind === "channel" ? "Message #product-polish" : `Message ${desktop.member.name}`,
      exact: true,
    });
    await composer.fill("Let’s improve the projects empty state.");
    await composer.press("Enter");
    const root = page
      .getByRole("article")
      .filter({ hasText: "Let’s improve the projects empty state." });
    await root.hover();
    await root.getByRole("button", { name: "Reply in thread", exact: true }).click();
    const thread = page.getByRole("complementary", { name: "Thread", exact: true });
    const replyComposer = thread.getByRole("textbox", { name: "Reply in thread…", exact: true });
    const source =
      `Add an explanation and a Create project button. ${"Long source context without losing the thread. ".repeat(15)}`.trim();
    await replyComposer.fill(source);
    await replyComposer.press("Enter");
    await expect(replyComposer).toHaveValue("");
    await replyComposer.fill("Keep this reply draft.");
    const message = thread.getByRole("article").filter({ hasText: source });
    await message.getByRole("group", { name: "Message actions", exact: true }).hover();
    await message.getByRole("button", { name: "Create task", exact: true }).click();
    const builder = thread.getByRole("region", { name: "Create task from message", exact: true });
    await builder.getByRole("combobox", { name: "Destination project", exact: true }).click();
    await page.getByRole("option", { name: project, exact: true }).click();
    await desktop.app.evaluate(({ BrowserWindow }, size) => {
      const window = BrowserWindow.getAllWindows()[0]!;
      window.setMinimumSize(320, 200);
      window.setContentSize(size.width, size.height);
    }, scenario);
    const form = builder.getByRole("form", { name: "New task", exact: true });
    await form.getByLabel("Task title", { exact: true }).fill("Add a projects empty state");
    await form.getByLabel("Task title", { exact: true }).scrollIntoViewIfNeeded();
    await expect(builder.getByRole("combobox")).toHaveCount(4);
    await fits(builder, builder.getByRole("combobox"));
    await fits(form, form.getByRole("textbox"));
    await fits(form, form.getByLabel("Due date", { exact: true }));
    if (scenario.width === 1024) {
      expect(
        await form.evaluate((element) => element.getBoundingClientRect().height),
        "The collapsed builder stays compact in the desktop thread",
      ).toBeLessThan(520);
    }
    const sourcePreview = form.getByRole("group", { name: "Source message", exact: true });
    await expect(sourcePreview.getByText(source, { exact: true })).toBeHidden();
    for (const name of ["Status", "Priority", "Assignee"]) {
      await form.getByRole("combobox", { name, exact: true }).click();
      await fits(page.getByRole("listbox"), page.getByRole("option"));
      await page.keyboard.press("Escape");
    }
    await sourcePreview.getByText("Linked to this message", { exact: true }).click();
    await expect(sourcePreview.getByText(source, { exact: true })).toBeVisible();
    await fits(sourcePreview, sourcePreview.locator("blockquote"));
    await form.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(builder).toHaveCount(0);
    expect(taskCreations, "Cancel does not create a task").toBe(0);
    await expect(replyComposer).toHaveValue("Keep this reply draft.");

    await message.getByRole("group", { name: "Message actions", exact: true }).hover();
    await message.getByRole("button", { name: "Create task", exact: true }).click();
    await builder.getByRole("combobox", { name: "Destination project", exact: true }).click();
    await page.getByRole("option", { name: project, exact: true }).click();
    await form.getByLabel("Task title", { exact: true }).fill("   ");
    await form.getByRole("button", { name: "Create task", exact: true }).click();
    await expect(form.getByText("Enter a task title.", { exact: true })).toBeVisible();
    expect(taskCreations, "Invalid input does not create a task").toBe(0);
    await expect(builder.getByRole("link", { name: "Open created task", exact: true })).toHaveCount(
      0,
    );
    await form.getByLabel("Task title", { exact: true }).fill("Add a projects empty state");
    const create = form.getByRole("button", { name: "Create task", exact: true });
    await create.scrollIntoViewIfNeeded();
    await expect(create).toBeInViewport();
    await create.click();
    await expect(builder.getByRole("status")).toContainText("Task created and linked");
    expect(taskCreations, "Submission creates one linked task").toBe(1);
    await expect(replyComposer).toHaveValue("Keep this reply draft.");
    await builder.getByRole("link", { name: "Open created task", exact: true }).click();
    const details = page.getByRole("region", { name: "Task details", exact: true });
    await expect(
      details.getByRole("heading", { name: "Add a projects empty state", exact: true }),
    ).toBeVisible();
    await expect(details.getByText(source, { exact: true })).toBeVisible();
  });
}
