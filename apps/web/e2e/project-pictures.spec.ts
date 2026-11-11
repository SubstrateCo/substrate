import { test, visit } from "./test-support/fixtures";
import { project } from "./test-support/tasks";
import { expect } from "@playwright/test";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=",
  "base64",
);

test("project icons use the existing crop upload, survive reload, and clear back to the project symbol", async ({
  actors,
  client,
}) => {
  const created = await project(actors.sender);
  const owner = await client(actors.sender);
  await visit(owner, undefined, "/tasks", { projectId: created.entityId });
  await owner.page.getByRole("tab", { name: "Settings", exact: true }).click();
  const upload = owner.page.getByRole("region", { name: "Project icon", exact: true });
  await upload
    .locator('input[type="file"]')
    .setInputFiles({ name: "project.png", mimeType: "image/png", buffer: png });
  const crop = owner.page.getByRole("dialog", { name: "Edit project icon", exact: true });
  await crop.getByRole("button", { name: "Save picture", exact: true }).click();
  await expect(crop).toHaveCount(0);
  const sidebar = owner.page.getByRole("complementary", { name: "Projects", exact: true });
  const icon = sidebar.getByRole("button", { name: created.name, exact: true }).locator("img");
  await expect(icon).toHaveAttribute("src", new RegExp(`/project-icon/${created.entityId}\\?v=`));
  await expect
    .poll(() => icon.evaluate((element: HTMLImageElement) => element.naturalWidth))
    .toBeGreaterThan(0);
  const image = await icon.getAttribute("src");
  await owner.page.reload();
  await expect(icon).toHaveAttribute("src", image!);
  await owner.page.getByRole("tab", { name: "Settings", exact: true }).click();
  await upload.getByRole("button", { name: "Remove picture", exact: true }).click();
  await expect(icon).toHaveCount(0);
  await expect(upload.getByRole("button", { name: "Choose picture", exact: true })).toBeVisible();
  await owner.page.reload();
  await expect(sidebar.getByRole("button", { name: created.name, exact: true })).toBeVisible();
  await expect(icon).toHaveCount(0);
});
