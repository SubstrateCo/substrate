import { provisionVerifiedAccount } from "../../../web/e2e/test-support/auth.js";
import { provisionMember } from "../../../web/e2e/test-support/organizations.js";
import { test } from "../test-support/fixture.js";
import { expect, type Locator, type Page } from "@playwright/test";

async function fits(page: Page, locator: Locator) {
  await expect(locator).toBeVisible();
  await expect
    .poll(() =>
      locator.evaluate((element) => {
        const box = element.getBoundingClientRect();
        return (
          box.left >= -1 &&
          box.right <= innerWidth + 1 &&
          (element instanceof HTMLInputElement || element.scrollWidth <= element.clientWidth + 1)
        );
      }),
    )
    .toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

async function reachable(button: Locator) {
  await button.scrollIntoViewIfNeeded();
  await expect(button).toBeInViewport();
  expect(
    await button.evaluate((element) => {
      const box = element.getBoundingClientRect();
      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent);
        const bounds = parent.getBoundingClientRect();
        if (
          /(auto|scroll|hidden|clip)/.test(style.overflowX) &&
          (box.left < bounds.left - 1 || box.right > bounds.right + 1)
        )
          return false;
        if (
          /(auto|scroll|hidden|clip)/.test(style.overflowY) &&
          (box.top < bounds.top - 1 || box.bottom > bounds.bottom + 1)
        )
          return false;
      }
      return box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight;
    }),
    "The whole action is reachable within the viewport and every clipping ancestor",
  ).toBe(true);
}

for (const size of [
  { width: 1024, height: 768 },
  { width: 375, height: 812 },
  { width: 320, height: 812 },
  { width: 320, height: 568 },
]) {
  test(`Tasks projects, editing and sharing fit ${size.width}x${size.height} in Electron`, async ({
    desktop,
    browser,
  }) => {
    test.setTimeout(120_000);
    desktop.owner.name = `Owner ${"longname".repeat(15)}`;
    await desktop.provision();
    const memberContext = await browser.newContext({ baseURL: desktop.rendererOrigin });
    try {
      const member = await memberContext.newPage();
      await provisionVerifiedAccount(member, desktop.mailpit, desktop.member);
      await provisionMember(desktop.browser, member, desktop.member.email);
    } finally {
      await memberContext.close();
    }
    await desktop.app.evaluate(({ BrowserWindow }, viewport) => {
      const window = BrowserWindow.getAllWindows()[0]!;
      window.setMinimumSize(320, 200);
      window.setContentSize(viewport.width, viewport.height);
    }, size);
    const page = desktop.page;
    await desktop.openPath("/tasks");
    const projects = page.getByRole("complementary", { name: "Projects", exact: true });
    const projectName = `Launch ${"p".repeat(150)}`;
    await projects.getByRole("button", { name: "New project", exact: true }).click();
    await page.getByLabel("Project name", { exact: true }).fill(projectName);
    await fits(page, page.getByLabel("Project name", { exact: true }));
    await reachable(page.getByRole("button", { name: "Create project", exact: true }));
    await page.getByRole("button", { name: "Create project", exact: true }).click();
    await expect(page.getByRole("heading", { name: projectName, exact: true })).toBeVisible();
    await fits(page, projects);
    await reachable(page.getByRole("button", { name: "New task", exact: true }));
    await page.getByRole("button", { name: "New task", exact: true }).click();
    const form = page.getByRole("form", { name: "New task", exact: true });
    await fits(page, form);
    await page.screenshot({ path: test.info().outputPath(`tasks-form-${size.width}.png`) });
    const taskTitle = `Checklist ${"t".repeat(200)}`;
    await form.getByLabel("Task title", { exact: true }).fill(taskTitle);
    await form.getByLabel("Task description", { exact: true }).fill("description".repeat(100));
    for (const label of ["Status", "Priority", "Assignee"]) {
      await form.getByRole("combobox", { name: label, exact: true }).click();
      await fits(page, page.getByRole("listbox"));
      if (label === "Assignee")
        await page.screenshot({
          path: test.info().outputPath(`tasks-popover-${size.width}.png`),
          animations: "disabled",
        });
      await page.keyboard.press("Escape");
    }
    await form.getByLabel("Due date", { exact: true }).fill("2026-12-15");
    await reachable(form.getByRole("button", { name: "Create task", exact: true }));
    await reachable(form.getByRole("button", { name: "Cancel", exact: true }));
    await page.screenshot({ path: test.info().outputPath(`tasks-form-actions-${size.width}.png`) });
    await form.getByRole("button", { name: "Create task", exact: true }).click();
    const detail = page.getByRole("region", { name: "Task details", exact: true });
    await fits(page, detail);
    await detail.getByRole("heading", { name: taskTitle, exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: test.info().outputPath(`tasks-detail-${size.width}.png`) });
    await reachable(detail.getByRole("button", { name: "Close task", exact: true }));
    await reachable(detail.getByRole("button", { name: "Add subtask", exact: true }));
    await reachable(detail.getByRole("button", { name: "Edit task", exact: true }));
    await detail.getByRole("button", { name: "Edit task", exact: true }).click();
    await fits(page, page.getByRole("form", { name: "Edit task", exact: true }));
    await page.getByLabel("Task title", { exact: true }).fill(`${taskTitle} saved`);
    await reachable(page.getByRole("button", { name: "Save task", exact: true }));
    await page.getByRole("button", { name: "Save task", exact: true }).click();
    await expect(
      detail.getByRole("heading", { name: `${taskTitle} saved`, exact: true }),
    ).toBeVisible();
    await fits(page, detail);
    await detail.getByLabel("Add a comment", { exact: true }).fill("comment".repeat(100));
    await reachable(detail.getByRole("button", { name: "Post comment", exact: true }));
    await detail.getByRole("button", { name: "Post comment", exact: true }).click();
    await expect(detail.getByRole("article")).toContainText("comment".repeat(100));
    await fits(page, detail);
    await detail.getByRole("button", { name: "Add subtask", exact: true }).click();
    await fits(page, page.getByRole("form", { name: "New subtask", exact: true }));
    await reachable(page.getByRole("button", { name: "Create subtask", exact: true }));
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "New subtask", exact: true })).toHaveCount(0);
    await page.getByRole("tab", { name: "Settings", exact: true }).click();
    await fits(page, page.getByLabel("Project name", { exact: true }));
    const sharing = page.getByRole("region", { name: "Project sharing", exact: true });
    await sharing.scrollIntoViewIfNeeded();
    await fits(page, sharing);
    await expect(
      sharing.getByRole("combobox", { name: `${desktop.owner.name} permission`, exact: true }),
    ).toBeDisabled();
    await reachable(sharing.getByRole("button", { name: "Add access", exact: true }));
    await page.screenshot({ path: test.info().outputPath(`tasks-sharing-${size.width}.png`) });
    await sharing.getByRole("button", { name: "Add access", exact: true }).click();
    const addDialog = page.getByRole("dialog", { name: "Add project access", exact: true });
    await addDialog
      .getByRole("combobox", { name: "Search people", exact: true })
      .fill(desktop.member.name);
    await fits(page, addDialog);
    await addDialog.getByRole("option", { name: desktop.member.name, exact: true }).click();
    await addDialog.getByRole("combobox", { name: "Permission", exact: true }).click();
    await fits(page, page.getByRole("listbox"));
    await page.keyboard.press("Escape");
    await addDialog.getByRole("button", { name: "Review access", exact: true }).click();
    const review = page.getByRole("dialog", { name: "Review access change", exact: true });
    await fits(page, review);
    await reachable(review.getByRole("button", { name: "Confirm access", exact: true }));
    await reachable(review.getByRole("button", { name: "Cancel access change", exact: true }));
    await page.screenshot({
      path: test.info().outputPath(`tasks-access-review-${size.width}.png`),
    });
    await review.getByRole("button", { name: "Cancel access change", exact: true }).click();
    await expect(
      sharing.getByRole("listitem").filter({ hasText: desktop.member.name }),
    ).toHaveCount(0);
    await sharing.getByRole("button", { name: "Add access", exact: true }).click();
    await addDialog.getByRole("option", { name: desktop.member.name, exact: true }).click();
    await addDialog.getByRole("button", { name: "Review access", exact: true }).click();
    await review.getByRole("button", { name: "Confirm access", exact: true }).click();
    await expect(review).toHaveCount(0);
    const memberRow = sharing.getByRole("listitem").filter({ hasText: desktop.member.name });
    await memberRow.getByRole("combobox").click();
    await page.getByRole("option", { name: "View", exact: true }).click();
    await expect(memberRow.getByRole("button", { name: "Apply", exact: true })).toHaveAttribute(
      "data-variant",
      "outline",
    );
    await memberRow.getByRole("button", { name: "Apply", exact: true }).click();
    await expect(memberRow.getByRole("button", { name: "Apply", exact: true })).toHaveCount(0);
    await memberRow.getByRole("combobox").click();
    await page.getByRole("option", { name: "No access", exact: true }).click();
    await memberRow.getByRole("button", { name: "Apply", exact: true }).click();
    await reachable(review.getByRole("button", { name: "Remove access", exact: true }));
    await review.getByRole("button", { name: "Remove access", exact: true }).click();
    await expect(memberRow).toHaveCount(0);
    await page.getByRole("tab", { name: "Tasks", exact: true }).click();
    await detail.getByRole("button", { name: "Close task", exact: true }).click();
    await fits(page, page.getByRole("region", { name: "Project tasks", exact: true }));
    await projects.getByRole("button", { name: "New project", exact: true }).click();
    await page.getByLabel("Project name", { exact: true }).fill("Second project");
    await page.getByRole("button", { name: "Create project", exact: true }).click();
    await projects.getByRole("button", { name: projectName, exact: true }).click();
    await expect(page.getByRole("heading", { name: projectName, exact: true })).toBeVisible();
    await fits(page, projects);
  });
}
