import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

for (const viewport of [
  { width: 1440, height: 500 },
  { width: 800, height: 420 },
  { width: 390, height: 640 },
]) {
  for (const theme of ["light", "dark"]) {
    test(`pass3 task form and sharing visual proof ${theme} ${viewport.width}x${viewport.height}`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize(viewport);
      const directory = process.env.OPENCODE_SCREENSHOT_DIR ?? testInfo.outputPath("screenshots");
      await mkdir(directory, { recursive: true });
      const suffix = `${theme}-${viewport.width}x${viewport.height}.png`;
      await page.goto(
        `/iframe.html?id=projects-scenes-tasks--populated-workspace&viewMode=story&globals=theme:${theme}`,
      );
      await page.evaluate(() => document.fonts.ready);
      await page.getByRole("button", { name: "New project", exact: true }).click();
      await expect(page.getByLabel("Project name", { exact: true })).toBeFocused();
      await page.screenshot({ path: join(directory, `pass3-project-form-${suffix}`) });
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
      await page
        .getByRole("region", { name: "Project tasks", exact: true })
        .getByRole("button")
        .first()
        .click();
      await page.getByRole("button", { name: "Edit task", exact: true }).click();
      await page.getByLabel("Task title", { exact: true }).fill("Draft kept across tabs");
      await page
        .getByLabel("Task description", { exact: true })
        .fill("Keep these task details while reviewing project access.");
      await page.getByRole("tab", { name: "Project settings", exact: true }).click();
      await page.getByRole("combobox", { name: "Person or agent", exact: true }).click();
      await page.getByRole("option", { name: "Release assistant (agent)", exact: true }).click();
      await page.getByRole("combobox", { name: "Permission", exact: true }).click();
      await page.getByRole("option", { name: "Owner", exact: true }).click();
      await page.getByRole("button", { name: "Update access", exact: true }).click();
      await expect(
        page.getByRole("heading", { name: "Review project access", exact: true }),
      ).toBeInViewport();
      await page.screenshot({ path: join(directory, `pass3-sharing-review-${suffix}`) });
      await page.getByRole("tab", { name: "Tasks", exact: true }).click();
      await expect(page.getByLabel("Task title", { exact: true })).toHaveValue(
        "Draft kept across tabs",
      );
      await page.getByLabel("Task title", { exact: true }).focus();
      await expect(page.getByLabel("Task title", { exact: true })).toBeInViewport();
      await page.screenshot({ path: join(directory, `pass3-task-edit-${suffix}`) });
      await page.getByRole("button", { name: "Save task", exact: true }).click();
      await expect(page.getByRole("button", { name: "Edit task", exact: true })).toBeFocused();
      await expect(
        page.getByRole("heading", { name: "Draft kept across tabs", exact: true }),
      ).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(
        true,
      );
    });
  }
}
