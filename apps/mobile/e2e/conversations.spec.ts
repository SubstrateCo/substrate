import { captureMotion, captureScreenshot } from "./test-support/capture";
import { test } from "./test-support/fixtures";
import { signIn } from "./test-support/navigation";
import { expect } from "@playwright/test";

test("Expo web preview: conversation drawer, creation forms, browsing, and invitations", async ({
  page,
  workspace,
}, info) => {
  await signIn(page, info, workspace);
  await captureScreenshot(page, info, "messages-choose-conversation");
  await captureMotion(page, info, "conversation-drawer-open", async () => {
    await page.getByTestId("open-conversations").click();
    await expect(page.getByTestId(`conversation-${workspace.conversationId}`)).toBeVisible();
  });
  await captureScreenshot(page, info, "messages-conversation-drawer");
  for (const title of ["New direct message", "New group message"]) {
    await page.getByTestId("new-message").click();
    await expect(page.getByRole("heading", { name: "New message", exact: true })).toBeVisible();
    if (title === "New direct message")
      await captureScreenshot(page, info, "messages-new-message-picker");
    await page.getByRole("button", { name: title, exact: false }).click();
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
    await captureScreenshot(
      page,
      info,
      title === "New direct message" ? "messages-new-dm" : "messages-new-group",
    );
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
  }
  await page.getByTestId("new-message").click();
  await page.getByRole("button", { name: "New channel", exact: true }).click();
  await expect(page.getByRole("heading", { name: "New channel", exact: true })).toBeVisible();
  await captureScreenshot(page, info, "messages-new-channel");
  await page.getByLabel("Add people (optional)", { exact: true }).fill(workspace.partner.email);
  await page
    .getByRole("button", { name: `Invite ${workspace.partner.email}`, exact: true })
    .click();
  await expect(
    page.getByText(/They get an email invitation and join after they accept/),
  ).toBeVisible();
  await captureScreenshot(page, info, "messages-channel-external-history-consent");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toContainText("Discard changes?");
  await captureScreenshot(page, info, "messages-discard-conversation");
  await page.getByRole("alertdialog").getByRole("button", { name: "Discard", exact: true }).click();
  await page.getByTestId("new-message").click();
  await page.getByRole("button", { name: "Browse channels", exact: true }).click();
  await expect(page.getByRole("button", { name: "Join team-notes", exact: true })).toBeVisible();
  await captureScreenshot(page, info, "messages-browse-channels");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: /^Review \d+ invitations?$/ }).click();
  await expect(page.getByRole("heading", { name: "Invitations", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /^partner-review/ })).toBeVisible();
  await captureScreenshot(page, info, "messages-sharing-invitations");
  await page.getByRole("button", { name: /^partner-review/ }).click();
  await expect(page.getByRole("button", { name: "Accept invitation", exact: true })).toBeVisible();
  await captureScreenshot(page, info, "messages-sharing-invitation-review");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await captureMotion(page, info, "conversation-drawer-close", async () => {
    await page.getByTestId(`conversation-${workspace.conversationId}`).click();
    await expect(
      page.getByText("The mobile launch checklist is ready for review.", { exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId("conversation-drawer")).toHaveCount(0);
  });
  await captureScreenshot(page, info, "messages-partner-channel");
});
