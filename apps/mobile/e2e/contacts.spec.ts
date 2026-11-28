import { captureScreenshot } from "./test-support/capture";
import { test } from "./test-support/fixtures";
import { signIn } from "./test-support/navigation";
import { expect } from "@playwright/test";

test("Expo web preview: contact methods, affiliations, interactions, and linked follow-up", async ({
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
  await expect(page.getByTestId("contact-detail")).toBeVisible();
  await captureScreenshot(page, info, "contact-detail");
  await page.getByRole("button", { name: "Edit Contact", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Edit contact", exact: true })).toBeVisible();
  await captureScreenshot(page, info, "contact-edit");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "More Contact actions", exact: true }).click();
  await captureScreenshot(page, info, "contact-actions");
  await page.getByRole("button", { name: "Archive contact", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toContainText("Archive this contact?");
  await captureScreenshot(page, info, "contact-archive-confirmation");
  await page.getByRole("alertdialog").getByRole("button", { name: "Cancel", exact: true }).click();

  await page.getByRole("button", { name: workspace.partner.email, exact: true }).click();
  await expect(page.getByRole("button", { name: "Send email", exact: true })).toBeVisible();
  await captureScreenshot(page, info, "contact-method-actions");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Edit contact method", exact: true }),
  ).toBeVisible();
  await captureScreenshot(page, info, "contact-method-edit");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: workspace.partner.email, exact: true }).click();
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toContainText("Remove this detail?");
  await captureScreenshot(page, info, "contact-method-remove-confirmation");
  await page.getByRole("alertdialog").getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Add contact detail", exact: true }).click();
  await captureScreenshot(page, info, "contact-add-detail-actions");
  await page.getByRole("button", { name: "Email or phone", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Add email or phone", exact: true }),
  ).toBeVisible();
  await captureScreenshot(page, info, "contact-add-email");
  await page.getByRole("button", { name: "Type: Email", exact: true }).click();
  await captureScreenshot(page, info, "contact-method-type-picker");
  await page.getByRole("button", { name: "Phone", exact: true }).click();
  await expect(page.getByLabel("Phone number", { exact: true })).toBeVisible();
  await captureScreenshot(page, info, "contact-add-phone");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Discard", exact: true }).click();
  for (const [action, title, name] of [
    ["Website", "Add website", "contact-add-website"],
    ["Address", "Add address", "contact-add-address"],
  ]) {
    await page.getByRole("button", { name: "Add contact detail", exact: true }).click();
    await page.getByRole("button", { name: action, exact: true }).click();
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
    await captureScreenshot(page, info, name);
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
  }
  await page.getByRole("button", { name: "Add to account", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Add to account", exact: true })).toBeVisible();
  await captureScreenshot(page, info, "contact-add-to-account");
  await page.getByRole("button", { name: /^Account:/ }).click();
  await expect(page.getByRole("heading", { name: "Account", exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Northstar Studio · synthetic", exact: true }),
  ).toBeVisible();
  await captureScreenshot(page, info, "contact-account-picker");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Northstar Studio · synthetic", exact: true }).click();
  await expect(page.getByRole("button", { name: "Open account", exact: true })).toBeVisible();
  await captureScreenshot(page, info, "contact-affiliation-actions");
  await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();

  await page.getByRole("button", { name: "Log interaction", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Log interaction", exact: true })).toBeVisible();
  await captureScreenshot(page, info, "contact-log-interaction");
  await page.getByRole("button", { name: /^Type:/ }).click();
  await captureScreenshot(page, info, "interaction-kind-picker");
  await page.getByRole("button", { name: "Meeting", exact: true }).click();
  await expect(page.getByLabel("Duration in minutes", { exact: true })).toBeVisible();
  await captureScreenshot(page, info, "interaction-meeting-form");
  await page
    .getByLabel("Summary", { exact: true })
    .fill("Recorded from the Expo web preview · synthetic");
  await page.getByLabel("Duration in minutes", { exact: true }).fill("30");
  await page.getByRole("button", { name: "Log", exact: true }).click();
  await expect(
    page.getByText("Recorded from the Expo web preview · synthetic", { exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "New follow-up", exact: true }).click();
  await expect(page.getByRole("heading", { name: "New follow-up", exact: true })).toBeVisible();
  await captureScreenshot(page, info, "crm-follow-up-form");
  await page.getByRole("button", { name: /^Project:/ }).click();
  await expect(
    page.getByRole("button", { name: "Mobile launch · synthetic", exact: true }),
  ).toBeVisible();
  await captureScreenshot(page, info, "crm-follow-up-project-picker");
  await page.getByRole("button", { name: "Mobile launch · synthetic", exact: true }).click();
  const followUp = "Call Jordan after review · synthetic";
  await page.getByLabel("Title", { exact: true }).fill(followUp);
  await page.getByRole("switch", { name: "Share with the project's readers", exact: true }).click();
  await page.getByRole("button", { name: "Create", exact: true }).click();
  const followUpTask = page
    .getByRole("button", { name: followUp, exact: true })
    .filter({ has: page.getByText("Unscheduled", { exact: true }) });
  await expect(followUpTask).toBeVisible();
  await page.reload();
  await expect(followUpTask).toBeVisible();
  await captureScreenshot(page, info, "contact-follow-up-persisted");
  await followUpTask.click();
  await expect(page.getByTestId("task-detail")).toContainText(followUp);
  await captureScreenshot(page, info, "crm-follow-up-task-navigation");
});
