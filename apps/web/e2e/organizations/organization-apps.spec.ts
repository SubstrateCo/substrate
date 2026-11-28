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
  const personal = page.getByRole("region", { name: "Personal apps", exact: true });
  await expect(personal.getByRole("switch", { name: "Inbox", exact: true })).not.toBeChecked();
  await expect(
    page
      .getByRole("navigation", { name: "Apps", exact: true })
      .getByRole("link", { name: /^Inbox/ }),
  ).toHaveCount(0);
  const messagesCard = apps.getByRole("region", { name: "Messages", exact: true });
  const agentsCard = apps.getByRole("region", { name: "Agents", exact: true });
  await expect(messagesCard.getByText("Required", { exact: true })).toBeVisible();
  await expect(agentsCard.getByText("Required", { exact: true })).toBeVisible();
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

test("member can change personal apps but not workspace apps", async ({ actors, client }) => {
  const user = await client(actors.member);
  const secondDevice = await client(actors.member);
  const owner = await client(actors.sender);
  await visit(user, undefined, "/settings/organization/apps");
  await visit(secondDevice, undefined, "/settings/organization/apps");
  await visit(owner, undefined, "/settings/organization/apps");
  await expect(user.page.getByRole("heading", { name: "Apps", exact: true })).toBeVisible();
  await expect(user.page.getByRole("region", { name: "Tasks", exact: true })).toBeVisible();
  const workspace = user.page.getByRole("region", { name: "Workspace apps", exact: true });
  await expect(workspace.getByRole("switch")).toHaveCount(0);
  await expect(workspace.getByRole("region", { name: "Tasks", exact: true })).toContainText(
    "Enabled",
  );
  const personal = user.page.getByRole("region", { name: "Personal apps", exact: true });
  const inbox = personal.getByRole("switch", { name: "Inbox", exact: true });
  const otherInbox = secondDevice.page.getByRole("switch", { name: "Inbox", exact: true });
  const ownerInbox = owner.page.getByRole("switch", { name: "Inbox", exact: true });
  await expect(inbox).not.toBeChecked();
  await expect(otherInbox).not.toBeChecked();
  await expect(ownerInbox).not.toBeChecked();
  await inbox.click();
  await expect(inbox).toBeChecked();
  await expect(otherInbox).toBeChecked();
  await expect(ownerInbox).not.toBeChecked();
  await expect(
    user.page
      .getByRole("navigation", { name: "Apps", exact: true })
      .getByRole("link", { name: /^Inbox/ }),
  ).toBeVisible();
  await inbox.click();
  const confirm = user.page.getByRole("dialog", { name: "Disable Inbox?", exact: true });
  await expect(confirm).toContainText("Other members are not affected.");
  await confirm.getByRole("button", { name: "Disable Inbox", exact: true }).click();
  await expect(inbox).not.toBeChecked();
  await expect(otherInbox).not.toBeChecked();
  await visit(user, undefined, "/inbox");
  await expect(
    user.page.getByText("This personal app is not enabled for you in this workspace.", {
      exact: false,
    }),
  ).toBeVisible();
  await user.page.getByRole("link", { name: "View apps", exact: true }).click();
  const settings = user.page.getByRole("navigation", { name: "Settings sections", exact: true });
  await expect(settings.getByRole("link", { name: "Apps", exact: true })).toBeVisible();
  await expect(settings.getByRole("link", { name: "Members", exact: true })).toHaveCount(0);
});
