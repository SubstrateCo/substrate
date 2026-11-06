import { expect, test } from "@playwright/test";
import { openStory } from "./stories";

test("source fields preserve title and description through refresh, failure, and retry", async ({
  page,
}) => {
  await openStory(page, "workspace-context-refresh--ready");
  const title = page.getByRole("textbox", { name: "Task title", exact: true });
  const description = page.getByRole("textbox", { name: "Task description" });
  await title.fill("Customer checklist draft");
  await description.fill("Keep this unsaved description");
  await page.getByRole("button", { name: "Refresh fields", exact: true }).click();
  await expect(title).toHaveValue("Customer checklist draft");
  await expect(description).toHaveValue("Keep this unsaved description");
  await page.getByRole("button", { name: "Fail refresh", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(title).toHaveValue("Customer checklist draft");
  await expect(description).toHaveValue("Keep this unsaved description");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(title).toHaveValue("Customer checklist draft");
  await expect(description).toHaveValue("Keep this unsaved description");
});

test("source fields hide cached form and draft when access is lost", async ({ page }) => {
  await openStory(page, "workspace-context-refresh--ready");
  await page.getByRole("textbox", { name: "Task title", exact: true }).fill("Private draft");
  await page.getByRole("button", { name: "Revoke access", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Task title", exact: true })).toHaveCount(0);
  await expect(page.getByRole("alert")).toContainText("Project unavailable");
});

for (const theme of ["light", "dark"]) {
  test(`context panels wrap long titles and keep actions usable in ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const [story, region, name] of [
      ["workspace-link-work--long-title", "Link existing work", "link"],
      ["workspace-link-work--long-title-pending", "Link existing work", "pending"],
      ["workspace-notifications--long-title", "Notifications", "notifications"],
      ["workspace-related-context--long-title", "Related context", "discussions"],
    ]) {
      await page.goto(`/iframe.html?id=${story}&viewMode=story&globals=theme:${theme}`);
      await expect(page.getByRole("region", { name: region, exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      if (name === "link") {
        const action = page.getByRole("button", { name: /^Link Customer launch checklist/ });
        await expect(action).toHaveAccessibleName(
          "Link Customer launch checklist — " + "UnbrokenCustomerReference".repeat(8),
        );
        await expect(action).toBeInViewport({ ratio: 1 });
        await expect(action).toHaveText("Link");
      }
      if (name === "pending") {
        const action = page.getByRole("button", { name: /Linking Customer launch checklist/ });
        await expect(action).toBeDisabled();
        await expect(action).toBeInViewport({ ratio: 1 });
        await expect(action).toHaveText("Linking…");
      }
      if (name === "notifications") {
        await expect(
          page.getByRole("button", { name: "Close notifications", exact: true }),
        ).toBeInViewport({ ratio: 1 });
        const title = page.getByRole("link", { name: /Assigned to you Customer launch checklist/ });
        expect(await title.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
          true,
        );
        expect(
          await title.evaluate((element) => element.getBoundingClientRect().width),
        ).toBeGreaterThan(180);
        await expect(
          page.getByRole("button", { name: "Mark as read", exact: true }).first(),
        ).toBeInViewport({ ratio: 1 });
      }
      await page.screenshot({
        path: `C:/Users/mahar/AppData/Local/Temp/opencode/context-${name}-${theme}-390x844.png`,
        fullPage: true,
      });
      if (name === "link") {
        await page.getByRole("button", { name: /^Link Customer launch checklist/ }).click();
        await expect(page.getByRole("status")).toHaveText("Work linked.");
      }
      if (name === "notifications") {
        await page.getByRole("button", { name: "Close notifications", exact: true }).click();
        await expect(page.getByRole("status")).toHaveText("Notifications closed.");
        await expect(page.getByRole("region", { name: "Notifications", exact: true })).toHaveCount(
          0,
        );
      }
    }
    await page.goto(
      `/iframe.html?id=workspace-link-work--dialog-panel&viewMode=story&globals=theme:${theme}`,
    );
    const dialog = page.getByRole("dialog", { name: "Link work from a message" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Close", exact: true })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Tasks", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const tasks = dialog.getByRole("button", { name: "Tasks", exact: true });
    const projects = dialog.getByRole("button", { name: "Projects", exact: true });
    expect(await tasks.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe(
      await projects.evaluate((element) => getComputedStyle(element).backgroundColor),
    );
    await expect(dialog.getByRole("textbox")).toHaveAttribute(
      "placeholder",
      "Search tasks to link…",
    );
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: `C:/Users/mahar/AppData/Local/Temp/opencode/context-dialog-${theme}-390x844.png`,
      fullPage: true,
    });
    await dialog.getByRole("button", { name: "Projects", exact: true }).click();
    await expect(dialog.getByRole("button", { name: "Projects", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(dialog.getByRole("button", { name: "Tasks", exact: true })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await page.mouse.move(0, 0);
    expect(await tasks.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe(
      await projects.evaluate((element) => getComputedStyle(element).backgroundColor),
    );
    await expect(dialog.getByRole("textbox")).toHaveAttribute(
      "placeholder",
      "Search projects to link…",
    );
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await expect(dialog).toHaveCount(0);
  });
  test(`source draft refresh stays usable in ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 900 });
    await page.goto(
      `/iframe.html?id=workspace-context-refresh--ready&viewMode=story&globals=theme:${theme}`,
    );
    await page
      .getByRole("textbox", { name: "Task title", exact: true })
      .fill("Customer checklist draft");
    await page.getByRole("button", { name: "Fail refresh", exact: true }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Task title", exact: true })).toHaveValue(
      "Customer checklist draft",
    );
    await page.screenshot({
      path: `C:/Users/mahar/AppData/Local/Temp/opencode/context-source-${theme}-900x900.png`,
      fullPage: true,
    });
    await page.goto(
      `/iframe.html?id=workspace-create-source-task--ready&viewMode=story&globals=theme:${theme}`,
    );
    await page.getByRole("combobox", { name: "Destination project" }).click();
    await page.getByRole("option", { name: "Product launch" }).click();
    await page.getByRole("textbox", { name: "Task title", exact: true }).fill("Customer checklist");
    await page.getByRole("button", { name: "Copy source text into description" }).click();
    await expect(page.getByRole("textbox", { name: "Task description" })).toHaveValue(
      "Customer asked for a launch checklist. Please check with [Reference].",
    );
    await page.screenshot({
      path: `C:/Users/mahar/AppData/Local/Temp/opencode/context-create-${theme}-900x900.png`,
      fullPage: true,
    });
  });
}

test("source fields distinguish initial loading from load failure and recover on retry", async ({
  page,
}) => {
  await openStory(page, "workspace-create-source-task--fields-loading");
  await page.getByRole("combobox", { name: "Destination project" }).click();
  await page.getByRole("option", { name: "Product launch" }).click();
  await expect(
    page.getByRole("status", { name: "Loading task fields", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Task title", exact: true })).toHaveCount(0);
  await openStory(page, "workspace-create-source-task--fields-error");
  await page.getByRole("combobox", { name: "Destination project" }).click();
  await page.getByRole("option", { name: "Product launch" }).click();
  await expect(page.getByRole("alert")).toContainText("Project unavailable");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("textbox", { name: "Task title", exact: true })).toBeVisible();
});
