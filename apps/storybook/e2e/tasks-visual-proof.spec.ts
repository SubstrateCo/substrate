import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

for (const width of [1024, 1440]) {
  for (const theme of ["light", "dark"]) {
    test(`task list detail and form visual proof ${theme} ${width}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      const directory = process.env.OPENCODE_SCREENSHOT_DIR ?? testInfo.outputPath("screenshots");
      await mkdir(directory, { recursive: true });
      await page.goto(
        `/iframe.html?id=projects-scenes-tasks--${theme === "dark" ? "dark-populated-workspace" : "populated-workspace"}&viewMode=story`,
      );
      const list = page.getByRole("region", {
        name: "Project tasks",
        exact: true,
      });
      await expect(list.getByRole("button")).toHaveCount(48);
      await expect(list.getByText("Due date", { exact: true })).toBeVisible();
      await page.screenshot({
        path: join(directory, `tasks-list-${theme}-${width}.png`),
      });
      await list.getByRole("button").first().click();
      await expect(
        page.getByRole("heading", { name: "Description", exact: true }),
      ).toBeInViewport();
      await page.screenshot({
        path: join(directory, `tasks-detail-${theme}-${width}.png`),
      });
      await page.getByRole("button", { name: "New task", exact: true }).click();
      await expect(page.getByLabel("Task title", { exact: true })).toBeInViewport();
      await page.screenshot({
        path: join(directory, `tasks-form-${theme}-${width}.png`),
      });
    });
  }
}

for (const state of ["empty-workspace", "project-error"]) {
  for (const theme of ["light", "dark"]) {
    test(`task ${state} visual proof ${theme}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      const directory = process.env.OPENCODE_SCREENSHOT_DIR ?? testInfo.outputPath("screenshots");
      await mkdir(directory, { recursive: true });
      await page.goto(
        `/iframe.html?id=projects-scenes-tasks--${state}&viewMode=story&globals=theme:${theme}`,
      );
      await expect(
        page.getByRole("heading", {
          name: state === "empty-workspace" ? "No projects yet" : "Couldn’t load project",
          exact: true,
        }),
      ).toBeVisible();
      await page.screenshot({
        path: join(directory, `tasks-${state}-${theme}-1440.png`),
      });
    });
  }
}
