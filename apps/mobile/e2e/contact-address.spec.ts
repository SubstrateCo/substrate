import { captureScreenshot } from "./test-support/capture";
import { test } from "./test-support/fixtures";
import { signIn } from "./test-support/navigation";
import { expect } from "@playwright/test";

test("Expo web preview: add and edit a real persisted synthetic contact address", async ({
  page,
  workspace,
}, info) => {
  await signIn(page, info, workspace);
  await page.goto(
    `/?${new URLSearchParams({
      tab: "crm",
      record: JSON.stringify({ kind: "contact", id: workspace.contactId }),
    })}`,
  );
  await page.getByRole("button", { name: "Add contact detail", exact: true }).click();
  await page.getByRole("button", { name: "Address", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Add address", exact: true })).toBeVisible();
  await page.getByLabel("Street", { exact: true }).fill("123 Synthetic Way");
  await page.getByLabel("City", { exact: true }).fill("Example Harbor");
  await page.getByLabel("Country code", { exact: true }).fill("US");
  await page.getByLabel("Label", { exact: true }).fill("Test office");
  const address = "Synthetic review office — not a real address";
  await page.getByLabel("Full address as written", { exact: true }).fill(address);
  await captureScreenshot(page, info, "contact-address-create-form");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const row = page.getByRole("button", { name: address, exact: true });
  await expect(row).toBeVisible();
  await row.click();
  await captureScreenshot(page, info, "contact-address-actions");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Edit address", exact: true })).toBeVisible();
  await expect(page.getByLabel("Street", { exact: true })).toHaveValue("123 Synthetic Way");
  await captureScreenshot(page, info, "contact-edit-address");
  await page.getByLabel("Street line 2", { exact: true }).fill("Suite E2E");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(row).toBeVisible();
  await page.reload();
  await row.click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByLabel("Street line 2", { exact: true })).toHaveValue("Suite E2E");
  await captureScreenshot(page, info, "contact-address-edit-persisted");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await row.click();
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toContainText("Remove this detail?");
  await captureScreenshot(page, info, "contact-address-remove-confirmation");
  await page.getByRole("alertdialog").getByRole("button", { name: "Cancel", exact: true }).click();
});
