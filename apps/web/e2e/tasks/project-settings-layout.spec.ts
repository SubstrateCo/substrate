import { test, visit } from "../test-support/fixtures";
import { captureScreenshot } from "../test-support/screenshots";
import { project, share } from "../test-support/tasks";
import { expect } from "@playwright/test";

test("project access aligns member insets and permission columns", async ({ actors, client }) => {
  const created = await project(actors.sender);
  await share(actors.sender, created.entityId, actors.member.name, "edit");
  const user = await client(actors.sender);
  const { page } = user;
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.emulateMedia({ colorScheme: "dark" });
  await visit(user, undefined, "/tasks", { projectId: created.entityId });
  await page.getByRole("tab", { name: "Settings", exact: true }).click();
  const access = page.getByRole("region", { name: "Project access", exact: true });
  const owner = access.getByRole("listitem").filter({ hasText: actors.sender.name });
  const editor = access.getByRole("listitem").filter({ hasText: actors.member.name });
  await expect(editor.getByRole("combobox")).toHaveText("Can edit");
  await expect(async () => {
    const title = await access.getByRole("heading", { name: "Project access" }).boundingBox();
    const avatar = await owner.locator("[data-slot=item-media]").boundingBox();
    const ownerLevel = await owner.getByText("Owner", { exact: true }).evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      return { x: range.getBoundingClientRect().x };
    });
    const editorLevel = await editor.locator("[data-slot=select-value]").boundingBox();
    expect(Math.abs(avatar!.x - title!.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(ownerLevel!.x - editorLevel!.x)).toBeLessThanOrEqual(1);
  }).toPass({ timeout: 5_000 });
  await editor.getByRole("combobox").click();
  await expect(page.getByRole("option", { name: "Can view", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await editor.hover();
  await access.scrollIntoViewIfNeeded();
  await captureScreenshot(page, "project-settings-alignment", { fullPage: false });
});
