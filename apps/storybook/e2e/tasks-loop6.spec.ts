import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

async function proof(page: Page, testInfo: TestInfo, name: string) {
  const directory = process.env.OPENCODE_SCREENSHOT_DIR ?? testInfo.outputPath("screenshots");
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: join(directory, `${name}.png`) });
}

async function projectHeader(page: Page) {
  const heading = page.getByRole("heading", { name: "Product launch", exact: true });
  await expect(heading).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  return heading.locator("xpath=ancestor::header");
}

for (const theme of ["light", "dark"]) {
  for (const action of ["Cancel", "Save project"]) {
    test(`project edit ${action} restores its trigger in ${theme}`, async ({ page }) => {
      await page.goto(
        `/iframe.html?id=projects-scenes-tasks--populated-workspace&viewMode=story&globals=theme:${theme}`,
      );
      await page.getByRole("tab", { name: "Project settings", exact: true }).click();
      const edit = page.getByRole("button", { name: "Edit project", exact: true });
      await edit.focus();
      await page.keyboard.press("Enter");
      await expect(page.getByLabel("Project name", { exact: true })).toBeFocused();
      await page.getByRole("button", { name: action, exact: true }).focus();
      await page.keyboard.press("Enter");
      await expect(edit).toBeFocused();
    });
  }

  for (const viewport of [
    { width: 800, height: 420 },
    { width: 1024, height: 768 },
    { width: 390, height: 700 },
  ]) {
    test(`project editing retains its full header and tabs in ${theme} at ${viewport.width}`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize(viewport);
      await page.goto(
        `/iframe.html?id=projects-scenes-tasks--populated-workspace&viewMode=story&globals=theme:${theme}`,
      );
      const header = await projectHeader(page);
      await page.getByRole("tab", { name: "Project settings", exact: true }).click();
      const before = await header.boundingBox();
      const tabs = await page.getByRole("tablist").boundingBox();
      await page.getByRole("button", { name: "Edit project", exact: true }).click();
      await expect(header).toBeInViewport();
      expect(await header.boundingBox()).toEqual(before);
      expect(await page.getByRole("tablist").boundingBox()).toEqual(tabs);
      await proof(page, testInfo, `project-edit-${theme}-${viewport.width}x${viewport.height}`);
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
      expect(await header.boundingBox()).toEqual(before);
      await page.getByRole("button", { name: "Edit project", exact: true }).click();
      await page.getByRole("button", { name: "Save project", exact: true }).click();
      expect(await header.boundingBox()).toEqual(before);
      expect(await page.getByRole("tablist").boundingBox()).toEqual(tabs);
    });
  }

  test(`800px project header keeps actions beside the title in ${theme}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 800, height: 420 });
    await page.goto(
      `/iframe.html?id=projects-scenes-tasks--populated-workspace&viewMode=story&globals=theme:${theme}`,
    );
    const header = await projectHeader(page);
    const bounds = (await header.boundingBox())!;
    const title = (await page
      .getByRole("heading", { name: "Product launch", exact: true })
      .boundingBox())!;
    const action = (await page
      .getByRole("button", { name: "New task", exact: true })
      .boundingBox())!;
    expect(bounds.height).toBeLessThanOrEqual(76);
    expect(Math.abs(title.y - action.y)).toBeLessThanOrEqual(4);
    await proof(page, testInfo, `project-header-${theme}-800x420`);
    await page.getByRole("button", { name: "New task", exact: true }).click();
    expect(await header.boundingBox()).toEqual(bounds);
    await page.getByRole("tab", { name: "Project settings", exact: true }).click();
    expect(await header.boundingBox()).toEqual(bounds);
  });

  test(`sharing uses one calm six-member list with working keyboard actions in ${theme}`, async ({
    page,
  }, testInfo) => {
    await page.goto(
      `/iframe.html?id=projects-scenes-tasks--populated-workspace&viewMode=story&globals=theme:${theme}`,
    );
    await page.getByRole("tab", { name: "Project settings", exact: true }).click();
    const sharing = page.getByRole("region", { name: "Project sharing", exact: true });
    const members = sharing.getByRole("listitem");
    await expect(members).toHaveCount(6);
    for (const name of [
      "Alex Morgan",
      "Release assistant",
      "Sam Rivera",
      "Taylor Kim",
      "Jordan Lee",
      "Research assistant",
    ]) {
      await expect(sharing.getByRole("list").getByText(name, { exact: true })).toBeVisible();
      await expect(
        sharing.getByRole("button", { name: `Remove ${name}`, exact: true }),
      ).toBeEnabled();
    }
    for (const row of await members.all()) {
      await expect(row.locator('[data-slot="item"]')).toHaveCSS(
        "background-color",
        "rgba(0, 0, 0, 0)",
      );
    }
    await expect(sharing.getByText("Owner access", { exact: true })).toHaveCount(1);
    await expect(sharing.getByText("Edit access", { exact: true })).toHaveCount(5);
    await proof(page, testInfo, `sharing-list-${theme}-1440x900`);
    await sharing.getByRole("button", { name: "Remove Release assistant", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(members).toHaveCount(5);
    await expect(
      sharing.getByRole("list").getByText("Release assistant", { exact: true }),
    ).toHaveCount(0);
  });

  test(`a completed project save does not steal focus after tab navigation in ${theme}`, async ({
    page,
  }) => {
    await page.goto(
      `/iframe.html?id=projects-scenes-task-frame--deferred-project-edit&viewMode=story&globals=theme:${theme}`,
    );
    await page.getByRole("tab", { name: "Project settings", exact: true }).click();
    await page.getByRole("button", { name: "Edit project", exact: true }).click();
    await page.getByRole("button", { name: "Save project", exact: true }).click();
    const tasks = page.getByRole("tab", { name: "Tasks", exact: true });
    await tasks.click();
    await page
      .getByRole("button", { name: "Complete project save", exact: true })
      .dispatchEvent("click");
    await expect(page.getByRole("tab", { name: "Project settings", exact: true })).toHaveAttribute(
      "aria-selected",
      "false",
    );
    await expect(page.getByRole("button", { name: "Edit project", exact: true })).toHaveCount(0);
    await expect(tasks).toBeFocused();
  });

  for (const width of [390, 800, 1024, 1440]) {
    test(`loading and ready task columns and first group align in ${theme} at ${width}`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 768 });
      await page.goto(
        `/iframe.html?id=projects-scenes-task-frame--loading-transition&viewMode=story&globals=theme:${theme}`,
      );
      const loading = page.getByRole("status", { name: "Loading project", exact: true });
      await expect(loading).toBeVisible();
      const columns = loading.locator('[data-slot="project-loading-columns"]');
      const assignee = loading.locator('[data-loading-field="assignee"]').first();
      const due = loading.locator('[data-loading-field="due-date"]').first();
      const before = {
        columns: await columns.isVisible(),
        assignee: await assignee.isVisible(),
        due: await due.isVisible(),
        group: await loading.locator('[data-slot="project-loading-group"]').boundingBox(),
      };
      await proof(page, testInfo, `loading-${theme}-${width}x768`);
      await page.getByRole("button", { name: "Resolve loading", exact: true }).click();
      const list = page.getByRole("region", { name: "Project tasks", exact: true });
      const group = list.getByRole("heading", { name: "Not Started 12", exact: true });
      await expect(group).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      expect(await list.getByText("Assignee", { exact: true }).isVisible()).toBe(before.columns);
      expect(await list.getByText("Alex Morgan", { exact: true }).first().isVisible()).toBe(
        before.assignee,
      );
      expect(await list.getByText("2026-11-06", { exact: true }).first().isVisible()).toBe(
        before.due,
      );
      const after = (await group.boundingBox())!;
      expect(Math.abs(after.y - before.group!.y)).toBeLessThanOrEqual(1);
      expect(Math.abs(after.x - before.group!.x)).toBeLessThanOrEqual(1);
      await proof(page, testInfo, `ready-${theme}-${width}x768`);
    });
  }
}
