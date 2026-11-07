import { switchWorkspace } from "../../../web/e2e/test-support/organizations.js";
import { requestBrowserSignIn } from "../test-support/auth.js";
import { test } from "../test-support/fixture.js";
import { expect } from "@playwright/test";

test("workspace creation and switching keep records isolated and restore the last selection after sign-in", async ({
  desktop,
}) => {
  await desktop.provision();
  const { page } = desktop;
  const other = `Second ${desktop.workspace}`;
  await desktop.openPath("/organizations");
  await page.getByLabel("Workspace name", { exact: true }).fill(other);
  await page.getByLabel("Workspace slug", { exact: true }).fill(`second-${desktop.suffix}`);
  await page.getByRole("button", { name: "Create workspace", exact: true }).click();
  await expect(page.getByRole("button", { name: `${other} ▾`, exact: true })).toBeVisible();
  await switchWorkspace(page, other, desktop.workspace);
  await desktop.openPath("/settings/organization");
  await page.getByRole("tab", { name: "Invitations", exact: true }).click();
  await page.getByLabel("Email", { exact: true }).fill(desktop.member.email);
  await page.getByRole("button", { name: "Send invitation", exact: true }).click();
  await expect(page.getByRole("row").filter({ hasText: desktop.member.email })).toContainText(
    "pending",
  );
  await switchWorkspace(page, desktop.workspace, other);
  await desktop.openPath("/settings/organization");
  await page.getByRole("tab", { name: "Invitations", exact: true }).click();
  await expect(page.getByRole("row").filter({ hasText: desktop.member.email })).toHaveCount(0);
  await desktop.signout();
  await desktop.browser.context().clearCookies();
  await requestBrowserSignIn(desktop.app, page, desktop.browser);
  await desktop.login(desktop.owner);
  await expect(page.getByRole("button", { name: `${other} ▾`, exact: true })).toBeVisible();
});
