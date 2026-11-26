import { captureScreenshot } from "./test-support/capture";
import { test } from "./test-support/fixtures";
import { signIn } from "./test-support/navigation";
import { expect } from "@playwright/test";

test("Expo web preview: CRM lists, pipeline settings, and interaction details", async ({
  page,
  workspace,
}, info) => {
  await signIn(page, info, workspace);
  await page.getByTestId("nav-crm").click();
  await expect(
    page.getByRole("button", { name: "Jordan Lee · test contact", exact: true }),
  ).toBeVisible();
  await captureScreenshot(page, info, "crm-contacts");
  await page.getByTestId("crm-create").click();
  await expect(page.getByRole("heading", { name: "New contact", exact: true })).toBeVisible();
  await captureScreenshot(page, info, "crm-new-contact");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("button", { name: "Remove Records filter" })).toHaveCount(0);
  await page.getByRole("button", { name: "Records is Active", exact: true }).click();
  await page.getByRole("button", { name: "Archived", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Records is Archived", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("No archived contacts", { exact: true })).toBeVisible();
  await captureScreenshot(page, info, "crm-archived-contacts");
  await page.getByRole("tab", { name: "Accounts", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Northstar Studio · synthetic", exact: true }),
  ).toBeVisible();
  await captureScreenshot(page, info, "crm-accounts");
  await page.getByTestId("crm-create").click();
  await expect(page.getByRole("heading", { name: "New account", exact: true })).toBeVisible();
  await captureScreenshot(page, info, "crm-new-account");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("tab", { name: "Deals", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Mobile design partnership · synthetic", exact: true }),
  ).toBeVisible();
  await captureScreenshot(page, info, "crm-deals");
  await page.getByRole("tab", { name: "Pipeline", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Mobile design partnership · synthetic", exact: true }),
  ).toBeVisible();
  await captureScreenshot(page, info, "crm-pipeline");
  await page.getByRole("button", { name: "Edit pipeline stages", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Pipeline stages", exact: true })).toBeVisible();
  await captureScreenshot(page, info, "crm-pipeline-stages");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("tab", { name: "Interactions", exact: true }).click();
  const meeting = page.getByRole("button", {
    name: "Meeting: Discussed launch scope and the next design review.",
    exact: true,
  });
  await expect(meeting).toBeVisible();
  await captureScreenshot(page, info, "crm-interactions");
  await page.getByTestId("crm-create").click();
  await expect(page.getByRole("heading", { name: "Log interaction", exact: true })).toBeVisible();
  await captureScreenshot(page, info, "crm-log-interaction");
  await page.getByRole("button", { name: /^Contact:/ }).click();
  await expect(
    page.getByRole("button", { name: "Jordan Lee · test contact", exact: true }),
  ).toBeVisible();
  await captureScreenshot(page, info, "interaction-contact-picker");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await meeting.click();
  await expect(page.getByTestId("interaction-detail")).toBeVisible();
  await captureScreenshot(page, info, "interaction-detail");
  await page.getByRole("button", { name: /^Edit Meeting/ }).click();
  await expect(page.getByRole("heading", { name: "Edit summary", exact: true })).toBeVisible();
  await captureScreenshot(page, info, "interaction-edit-summary");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: /^More Meeting.* actions$/ }).click();
  await captureScreenshot(page, info, "interaction-actions");
  await page.getByRole("button", { name: "Delete interaction", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toContainText("Delete this interaction?");
  await captureScreenshot(page, info, "interaction-delete-confirmation");
  await page.getByRole("alertdialog").getByRole("button", { name: "Cancel", exact: true }).click();
});
