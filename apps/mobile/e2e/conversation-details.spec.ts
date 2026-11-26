import { captureScreenshot } from "./test-support/capture";
import { test } from "./test-support/fixtures";
import { signIn } from "./test-support/navigation";
import { expect } from "@playwright/test";

test("Expo web preview: conversation profiles, members, sharing, and management dialogs", async ({
  page,
  workspace,
}, info) => {
  await signIn(page, info, workspace);
  await page.goto(`/?${new URLSearchParams({ conversationId: workspace.conversationId })}`);
  await page.getByTestId("conversation-header").click();
  await expect(
    page.getByRole("heading", { name: workspace.conversationName, exact: true }),
  ).toBeVisible();
  await captureScreenshot(page, info, "conversation-details-members");
  await page.getByRole("button", { name: `Profile of ${workspace.name}`, exact: true }).click();
  await expect(page.getByRole("heading", { name: workspace.name, exact: true })).toBeVisible();
  await captureScreenshot(page, info, "conversation-person-profile");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Add people", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: `Add people to ${workspace.conversationName}`, exact: true }),
  ).toBeVisible();
  await captureScreenshot(page, info, "conversation-add-people");
  await page.getByLabel("People", { exact: true }).fill(workspace.member.name);
  await page.getByRole("button", { name: `Add ${workspace.member.name}`, exact: true }).click();
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(
    page.getByRole("button", { name: `Remove ${workspace.member.name}`, exact: true }),
  ).toBeVisible();
  await captureScreenshot(page, info, "conversation-member-added");
  await page.getByRole("button", { name: `Remove ${workspace.member.name}`, exact: true }).click();
  await expect(page.getByRole("alertdialog")).toContainText(`Remove ${workspace.member.name}?`);
  await captureScreenshot(page, info, "conversation-remove-member-confirmation");
  await page.getByRole("alertdialog").getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "External collaboration", exact: true }).click();
  await expect(page.getByLabel("Invite by email", { exact: true })).toBeVisible();
  await captureScreenshot(page, info, "conversation-external-collaboration");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Change owner", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Change owner", exact: true })).toBeVisible();
  await captureScreenshot(page, info, "conversation-owner-picker");
  await page.getByRole("button", { name: workspace.member.name, exact: false }).click();
  await expect(page.getByRole("alertdialog")).toContainText(
    `Make ${workspace.member.name} the owner?`,
  );
  await captureScreenshot(page, info, "conversation-owner-change-confirmation");
  await page.getByRole("alertdialog").getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Leave channel", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Choose a new owner", exact: true }),
  ).toBeVisible();
  await captureScreenshot(page, info, "conversation-leave-owner-picker");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Delete channel", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toContainText(
    `Delete ${workspace.conversationName}?`,
  );
  await captureScreenshot(page, info, "conversation-delete-confirmation");
  await page.getByRole("alertdialog").getByRole("button", { name: "Cancel", exact: true }).click();
});
