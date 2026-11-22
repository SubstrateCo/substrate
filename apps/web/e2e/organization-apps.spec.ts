import { provisionWorkspaceSession } from "../../server/integration/test-support/organizations";
import { test, visit } from "./test-support/fixtures";
import { project } from "./test-support/tasks";
import { expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

async function captureApps(page: Page, name: string) {
  if (!process.env.E2E_SCREENSHOTS_DIR) return;
  const directory = resolve(process.env.E2E_SCREENSHOTS_DIR);
  await mkdir(directory, { recursive: true });
  const path = resolve(directory, `${name}.png`);
  await page.screenshot({ path, animations: "disabled", fullPage: true });
  await test.info().attach(name, { path, contentType: "image/png" });
}

test("owner enables independent apps, confirms disable, and restores preserved projects", async ({
  account,
  client,
}) => {
  const organization = await provisionWorkspaceSession(
    account.request,
    "Apps workspace",
    `apps-${crypto.randomUUID()}`,
    { enableOptionalApps: false },
  );
  account.organizationId = organization.id;
  account.state = await account.request.storageState();
  const user = await client(account);
  const { page } = user;
  await visit(user, undefined, "/settings/organization/apps");
  const apps = page.getByRole("region", { name: "Workspace apps", exact: true });
  await expect(apps.getByRole("button", { name: "Enable Tasks", exact: true })).toBeVisible();
  await expect(apps.getByRole("button", { name: "Enable CRM", exact: true })).toBeVisible();
  await captureApps(page, "apps-owner-default");

  await apps.getByRole("button", { name: "Enable CRM", exact: true }).click();
  await expect(apps.getByRole("button", { name: "Disable CRM", exact: true })).toBeVisible();
  await expect(apps.getByRole("button", { name: "Enable Tasks", exact: true })).toBeVisible();
  await captureApps(page, "apps-owner-mixed");
  await visit(user, undefined, "/tasks");
  await expect(page.getByRole("heading", { name: "Tasks is disabled", exact: true })).toBeVisible();
  await expect(
    page
      .getByRole("navigation", { name: "Apps", exact: true })
      .getByRole("link", { name: /^Tasks/ }),
  ).toHaveCount(0);
  const search = page.getByRole("combobox", { name: "Search workspace", exact: true });
  await search.fill("project");
  await expect(page.getByRole("tab", { name: "Messages", exact: true })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Tasks", exact: true })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Projects", exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await visit(user, undefined, "/crm");
  await expect(page.getByRole("button", { name: "New deal", exact: true })).toBeVisible();
  await visit(user, undefined, "/contacts");
  await expect(page.getByRole("button", { name: "New contact", exact: true })).toBeVisible();
  await page.keyboard.press("g");
  await page.keyboard.press("t");
  await expect(page).toHaveURL(/\/contacts/);

  await visit(user, undefined, "/settings/organization/apps");
  await apps.getByRole("button", { name: "Enable Tasks", exact: true }).click();
  await expect(apps.getByRole("button", { name: "Disable Tasks", exact: true })).toBeVisible();
  const preserved = await project(account);
  await apps.getByRole("button", { name: "Disable Tasks", exact: true }).click();
  const confirm = page.getByRole("dialog", { name: "Disable Tasks?", exact: true });
  await expect(confirm).toContainText("Existing projects and tasks are preserved.");
  await captureApps(page, "apps-disable-confirmation");
  await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(apps.getByRole("button", { name: "Disable Tasks", exact: true })).toBeVisible();
  await apps.getByRole("button", { name: "Disable Tasks", exact: true }).click();
  await confirm.getByRole("button", { name: "Disable Tasks", exact: true }).click();
  await expect(confirm).toHaveCount(0);
  await expect(apps.getByRole("button", { name: "Enable Tasks", exact: true })).toBeVisible();
  await visit(user, undefined, "/tasks", { projectId: preserved.entityId });
  await expect(page.getByRole("heading", { name: "Tasks is disabled", exact: true })).toBeVisible();
  await expect(page.getByText(preserved.name, { exact: true })).toHaveCount(0);
  await visit(user, undefined, "/settings/organization/apps");
  await apps.getByRole("button", { name: "Enable Tasks", exact: true }).click();
  await expect(apps.getByRole("button", { name: "Disable Tasks", exact: true })).toBeVisible();
  await visit(user, undefined, "/tasks", { projectId: preserved.entityId });
  await expect(page.getByText(preserved.name, { exact: true }).first()).toBeVisible();
});

test("member can view organization apps but cannot change them", async ({ actors, client }) => {
  const user = await client(actors.member);
  await visit(user, undefined, "/settings/organization/apps");
  await expect(user.page.getByRole("heading", { name: "Apps", exact: true })).toBeVisible();
  await expect(
    user.page.getByText("You can view your organization’s apps.", { exact: false }),
  ).toBeVisible();
  await expect(user.page.getByRole("region", { name: "Tasks", exact: true })).toBeVisible();
  await expect(
    user.page.getByRole("button", { name: /^(Enable|Disable) (Tasks|CRM)$/ }),
  ).toHaveCount(0);
  const settings = user.page.getByRole("navigation", { name: "Settings sections", exact: true });
  await expect(settings.getByRole("link", { name: "Apps", exact: true })).toBeVisible();
  await expect(settings.getByRole("link", { name: "Members", exact: true })).toHaveCount(0);
  await captureApps(user.page, "apps-member-read-only");
});
