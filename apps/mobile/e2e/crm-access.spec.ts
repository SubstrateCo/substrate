import { captureScreenshot } from "./test-support/capture";
import { test } from "./test-support/fixtures";
import { signIn } from "./test-support/navigation";
import { expect } from "@playwright/test";

test("Expo web preview: CRM direct sharing and responsible-owner changes stay distinct", async ({
  page,
  workspace,
}, info) => {
  await signIn(page, info, workspace);
  for (const kind of ["account", "deal"] as const) {
    const id = kind === "account" ? workspace.accountId : workspace.dealId;
    await page.goto(
      `/?${new URLSearchParams({
        tab: "crm",
        record: JSON.stringify({ kind, id }),
      })}`,
    );
    const detail = page.getByTestId(`${kind}-detail`);
    const owner = detail.getByRole("button", { name: `Owner: ${workspace.name}`, exact: true });
    await expect(owner).toBeVisible();
    await page.getByRole("button", { name: `Share ${kind}`, exact: true }).click();
    await expect(page.getByRole("heading", { name: `Share ${kind}`, exact: true })).toBeVisible();
    await captureScreenshot(page, info, `${kind}-share-form`);
    await page.getByRole("button", { name: /^Person:/ }).click();
    await expect(
      page.getByRole("button", { name: workspace.member.name, exact: false }),
    ).toBeVisible();
    await captureScreenshot(page, info, `${kind}-share-person-picker`);
    await page.getByRole("button", { name: workspace.member.name, exact: false }).click();
    await page.getByRole("button", { name: /^Access:/ }).click();
    await expect(page.getByRole("heading", { name: "Access", exact: true })).toBeVisible();
    await captureScreenshot(page, info, `${kind}-share-access-picker`);
    await page.getByRole("button", { name: "Can view", exact: true }).click();
    await page.getByRole("button", { name: "Share", exact: true }).click();
    const grant = detail.getByRole("button", { name: workspace.member.name, exact: true });
    await expect(grant).toContainText("Can view");
    // Sharing grants access; it must not silently change responsibility.
    await expect(owner).toBeVisible();
    await captureScreenshot(page, info, `${kind}-direct-access-saved`);
    await grant.click();
    await expect(
      page.getByRole("button", { name: "Remove direct access", exact: true }),
    ).toBeVisible();
    await captureScreenshot(page, info, `${kind}-direct-access-actions`);
    await page.getByRole("button", { name: "Remove direct access", exact: true }).click();
    await expect(page.getByRole("alertdialog")).toContainText(
      `Remove ${workspace.member.name}'s direct access?`,
    );
    await captureScreenshot(page, info, `${kind}-remove-access-confirmation`);
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Cancel", exact: true })
      .click();
    await owner.click();
    await expect(page.getByRole("heading", { name: "Change owner", exact: true })).toBeVisible();
    await captureScreenshot(page, info, `${kind}-change-owner-form`);
    await page.getByRole("button", { name: /^New owner:/ }).click();
    await expect(
      page.getByRole("button", { name: workspace.member.name, exact: false }),
    ).toBeVisible();
    await captureScreenshot(page, info, `${kind}-owner-person-picker`);
    await page.getByRole("button", { name: workspace.member.name, exact: false }).click();
    const restriction = page.getByRole("switch", {
      name: "Reassign even if they can't open it",
      exact: true,
    });
    await restriction.click();
    await expect(
      page.getByText(/Warning: they may become responsible for a record they cannot open/),
    ).toBeVisible();
    await captureScreenshot(page, info, `${kind}-owner-restricted-access-warning`);
    await restriction.click();
    await page.getByRole("button", { name: "Reassign", exact: true }).click();
    await expect(
      detail.getByRole("button", { name: `Owner: ${workspace.member.name}`, exact: true }),
    ).toBeVisible();
    await page.reload();
    const changedOwner = detail.getByRole("button", {
      name: `Owner: ${workspace.member.name}`,
      exact: true,
    });
    await expect(changedOwner).toBeVisible();
    await changedOwner.scrollIntoViewIfNeeded();
    await captureScreenshot(page, info, `${kind}-responsible-owner-persisted`);
    // Reassignment must not elevate the teammate's direct grant.
    await expect(
      detail.getByRole("button", { name: workspace.member.name, exact: true }),
    ).toContainText("Can view");
  }
});
