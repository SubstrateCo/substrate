import { createCrm } from "../../../server/integration/test-support/crm";
import { provisionWorkspaceSession } from "../../../server/integration/test-support/organizations";
import { visit } from "../test-support/fixtures";
import { project } from "../test-support/tasks";
import { test } from "../test-support/workspace-fixtures";
import { expect } from "@playwright/test";

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
  const tasksSwitch = apps.getByRole("switch", { name: "Tasks", exact: true });
  const crmSwitch = apps.getByRole("switch", { name: "CRM", exact: true });
  await expect(tasksSwitch).not.toBeChecked();
  await expect(crmSwitch).not.toBeChecked();
  await expect(apps.getByRole("switch", { name: "Inbox", exact: true })).not.toBeChecked();
  await expect(
    page
      .getByRole("navigation", { name: "Apps", exact: true })
      .getByRole("link", { name: /^Inbox/ }),
  ).toHaveCount(0);
  const messagesCard = apps.getByRole("region", { name: "Messages", exact: true });
  const agentsCard = apps.getByRole("region", { name: "Agents", exact: true });
  const messagesBounds = await messagesCard.boundingBox();
  const agentsBounds = await agentsCard.boundingBox();
  expect(messagesBounds).not.toBeNull();
  expect(agentsBounds).not.toBeNull();
  expect(messagesBounds!.y).toBe(agentsBounds!.y);
  expect(messagesBounds!.x).toBeLessThan(agentsBounds!.x);
  await page.setViewportSize({ width: 800, height: 900 });
  await expect
    .poll(async () => {
      const first = await messagesCard.boundingBox();
      const second = await agentsCard.boundingBox();
      return first && second && second.y >= first.y + first.height;
    })
    .toBe(true);
  await page.setViewportSize({ width: 1440, height: 900 });

  await crmSwitch.click();
  await expect(crmSwitch).toBeChecked();
  await expect(tasksSwitch).not.toBeChecked();
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
  // The header and the empty board both offer "New deal".
  await expect(page.getByRole("button", { name: "New deal", exact: true }).first()).toBeVisible();
  const contact = await createCrm(account, { action: "createContact", displayName: "App contact" });
  await visit(user, undefined, "/contacts", { recordId: contact.entityId });
  await expect(page.getByRole("heading", { name: "App contact", exact: true })).toBeVisible();
  await page.keyboard.press("g");
  await page.keyboard.press("t");
  await expect(page).toHaveURL(/\/contacts/);

  await visit(user, undefined, "/settings/organization/apps");
  await tasksSwitch.click();
  await expect(tasksSwitch).toBeChecked();
  const preserved = await project(account);
  await tasksSwitch.click();
  const confirm = page.getByRole("dialog", { name: "Disable Tasks?", exact: true });
  await expect(confirm).toContainText("Existing projects and tasks are preserved.");
  await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(tasksSwitch).toBeChecked();
  await tasksSwitch.click();
  await confirm.getByRole("button", { name: "Disable Tasks", exact: true }).click();
  await expect(confirm).toHaveCount(0);
  await expect(tasksSwitch).not.toBeChecked();
  await visit(user, undefined, "/tasks", { projectId: preserved.entityId });
  await expect(page.getByRole("heading", { name: "Tasks is disabled", exact: true })).toBeVisible();
  await expect(page.getByText(preserved.name, { exact: true })).toHaveCount(0);
  await visit(user, undefined, "/settings/organization/apps");
  await tasksSwitch.click();
  await expect(tasksSwitch).toBeChecked();
  await visit(user, undefined, "/tasks", { projectId: preserved.entityId });
  await expect(page.getByText(preserved.name, { exact: true }).first()).toBeVisible();
});

test("member can view organization apps but cannot change them", async ({ actors, client }) => {
  const user = await client(actors.member);
  await visit(user, undefined, "/settings/organization/apps");
  await expect(user.page.getByRole("heading", { name: "Apps", exact: true })).toBeVisible();
  await expect(user.page.getByRole("region", { name: "Tasks", exact: true })).toBeVisible();
  await expect(user.page.getByRole("region", { name: "Inbox", exact: true })).toContainText(
    "Disabled",
  );
  await expect(user.page.getByRole("switch")).toHaveCount(0);
  const settings = user.page.getByRole("navigation", { name: "Settings sections", exact: true });
  await expect(settings.getByRole("link", { name: "Apps", exact: true })).toBeVisible();
  await expect(settings.getByRole("link", { name: "Members", exact: true })).toHaveCount(0);
});
