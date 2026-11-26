import { captureScreenshot } from "./test-support/capture";
import { test } from "./test-support/fixtures";
import { signIn } from "./test-support/navigation";
import { expect } from "@playwright/test";

test("Expo web preview: workspace invitations, creation, switching, and sign-out", async ({
  page,
  workspace,
}, info) => {
  const invited = await workspace.partnerRequest.post("/api/auth/organization/invite-member", {
    data: {
      organizationId: workspace.partner.organizationId,
      email: workspace.email,
      role: "member",
    },
  });
  expect(invited.ok(), "The synthetic partner invites the reviewer to their workspace").toBe(true);
  await signIn(page, info, workspace);
  await page.getByTestId("workspace-menu").click();
  const invitation = page.getByRole("button", {
    name: `Accept invitation to ${workspace.partner.name}'s test workspace`,
    exact: true,
  });
  await expect(invitation).toBeVisible();
  await captureScreenshot(page, info, "workspace-picker-and-invitation");
  await invitation.click();
  await expect(page.getByTestId("workspace-menu")).toHaveAttribute(
    "aria-label",
    `Workspace: ${workspace.partner.name}'s test workspace`,
  );
  await captureScreenshot(page, info, "workspace-invitation-accepted");
  await page.getByTestId("workspace-menu").click();
  await page.getByRole("button", { name: "Create a workspace", exact: true }).click();
  await expect(page.getByLabel("Workspace name", { exact: true })).toBeVisible();
  await captureScreenshot(page, info, "workspace-create-form");
  const name = "Mobile-created workspace · synthetic";
  await page.getByLabel("Workspace name", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Create workspace", exact: true }).click();
  await expect(page.getByTestId("workspace-menu")).toHaveAttribute(
    "aria-label",
    `Workspace: ${name}`,
  );
  await page.reload();
  await expect(page.getByTestId("workspace-menu")).toHaveAttribute(
    "aria-label",
    `Workspace: ${name}`,
  );
  await captureScreenshot(page, info, "workspace-created-persisted");
  await page.getByTestId("workspace-menu").click();
  await page
    .getByRole("button", { name: `Open ${workspace.name}'s test workspace`, exact: true })
    .click();
  await expect(page.getByTestId("workspace-menu")).toHaveAttribute(
    "aria-label",
    `Workspace: ${workspace.name}'s test workspace`,
  );
  await page.getByTestId("workspace-menu").click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
  await expect(page.getByTestId("app-shell")).toHaveCount(0);
  await expect(page.getByText("Mobile launch · synthetic", { exact: true })).toHaveCount(0);
  await captureScreenshot(page, info, "workspace-signed-out");
});
