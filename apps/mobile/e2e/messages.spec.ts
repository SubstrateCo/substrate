import { captureMotion, captureScreenshot } from "./test-support/capture";
import { apiURL, mutation, previewURL, test } from "./test-support/fixtures";
import { openMessageActions } from "./test-support/messages";
import { closePanel, signIn } from "./test-support/navigation";
import { expect } from "@playwright/test";

test("Expo web preview: linked records, message actions, references, and a real partner thread", async ({
  page,
  workspace,
}, info) => {
  await signIn(page, info, workspace);
  await page.goto(`/?${new URLSearchParams({ conversationId: workspace.conversationId })}`);
  const source = page.getByTestId(`message-${workspace.messageId}`);
  const original = "The mobile launch checklist is ready for review.";
  await expect(source.getByText(original, { exact: true })).toBeVisible();
  await expect(
    source.getByRole("button", { name: /^Review the mobile launch checklist, Linked/ }),
  ).toBeVisible();
  await captureScreenshot(page, info, "messages-linked-records");
  await source.getByRole("button", { name: /^Review the mobile launch checklist, Linked/ }).click();
  await expect(page.getByTestId("task-detail")).toContainText("Review the mobile launch checklist");
  await captureScreenshot(page, info, "message-to-task-navigation");
  await closePanel(page);
  await source.getByRole("button", { name: /^Jordan Lee · test contact, Linked/ }).click();
  await expect(page.getByTestId("contact-detail")).toBeVisible();
  await captureScreenshot(page, info, "message-to-contact-navigation");
  await closePanel(page);

  await openMessageActions(page, workspace.messageId);
  await expect(page.getByRole("button", { name: "Edit message", exact: true })).toBeVisible();
  await captureScreenshot(page, info, "message-actions-and-reactions");
  await page.getByRole("button", { name: "Edit message", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Edit message", exact: true })).toBeVisible();
  await captureScreenshot(page, info, "message-edit");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await openMessageActions(page, workspace.messageId);
  await page.getByRole("button", { name: "Delete message", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toContainText("Delete this message?");
  await captureScreenshot(page, info, "message-delete-confirmation");
  await page.getByRole("alertdialog").getByRole("button", { name: "Cancel", exact: true }).click();
  await openMessageActions(page, workspace.messageId);
  await page.getByRole("button", { name: "React with 👍", exact: true }).click();
  const reaction = source.getByRole("button", { name: "👍 1, you reacted", exact: true });
  await expect(reaction).toBeVisible();
  await captureScreenshot(page, info, "message-reaction-saved");
  await reaction.click({ delay: 650 });
  await expect(page.getByRole("heading", { name: "Reacted with 👍", exact: true })).toBeVisible();
  await captureScreenshot(page, info, "message-reaction-people");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await openMessageActions(page, workspace.messageId);
  await page.getByRole("button", { name: "More reactions", exact: true }).click();
  await page.getByRole("textbox", { name: "Search emoji", exact: true }).fill("rocket");
  await page.getByRole("button", { name: "React with rocket ship launch", exact: true }).click();
  await expect(
    source.getByRole("button", { name: "🚀 1, you reacted", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    source.getByRole("button", { name: "🚀 1, you reacted", exact: true }),
  ).toBeVisible();
  await source.getByRole("button", { name: "🚀 1, you reacted", exact: true }).click();
  await expect(source.getByRole("button", { name: "🚀 1, you reacted", exact: true })).toHaveCount(
    0,
  );

  await captureMotion(page, info, "thread-open", async () => {
    await source.getByRole("button", { name: "1 reply", exact: true }).click();
    await expect(
      page.getByText("Thanks Alex. I will review the handoff today.", { exact: true }),
    ).toBeVisible();
  });
  await captureScreenshot(page, info, "messages-partner-thread");
  const thread = page.getByTestId("thread-screen");
  // Expo keeps the previous route mounted, but not in the active accessibility tree.
  await expect(page.getByTestId("app-shell").getByRole("textbox")).toHaveCount(0);
  const reply = "Confirmed from the Expo web preview · synthetic reply";
  await thread.getByRole("textbox", { name: "Reply in thread", exact: true }).fill(reply);
  await thread.getByTestId("send-message").click();
  await expect(thread.getByText(reply, { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText(reply, { exact: true })).toBeVisible();
  await captureScreenshot(page, info, "messages-thread-reply-persisted");
  await page.getByRole("button", { name: "Back to conversation", exact: true }).click();
  await expect(source).toBeVisible();
  const composer = page.getByTestId("app-shell").getByRole("textbox");
  await composer.pressSequentially("@project:Mobile", { delay: 20 });
  const project = page.getByRole("button", { name: /^Insert Mobile launch · synthetic/ });
  await expect(project).toBeVisible();
  await captureScreenshot(page, info, "messages-reference-picker");
  await project.click();
  await composer.press("End");
  await composer.pressSequentially(" is ready for the next review.");
  await page.getByTestId("send-message").click();
  await expect(page.getByText(/is ready for the next review\./)).toBeVisible();
  await page.reload();
  await expect(page.getByText(/is ready for the next review\./)).toBeVisible();
  await captureScreenshot(page, info, "messages-structured-reference-persisted");
  await page.getByRole("link", { name: "@Mobile launch · synthetic", exact: true }).click();
  await expect(page.getByTestId("project-detail")).toBeVisible();
});

test("Expo web preview: admins manage private conversation metadata without opening messages", async ({
  page,
  playwright,
  workspace,
}, info) => {
  const teammate = await playwright.request.newContext({
    baseURL: apiURL,
    extraHTTPHeaders: { origin: previewURL },
  });
  try {
    const signedIn = await teammate.post("/api/auth/sign-in/email", {
      data: { email: workspace.member.email, password: workspace.member.password },
    });
    expect(signedIn.ok()).toBe(true);
    const active = await teammate.post("/api/auth/organization/set-active", {
      data: { organizationId: workspace.organizationId },
    });
    expect(active.ok()).toBe(true);
    const name = "Private admin review · synthetic";
    const conversation = await mutation<{ id: string }>(teammate, "messaging/conversations", {
      organizationId: workspace.organizationId,
      kind: "channel",
      name,
      private: true,
    });
    const privateBody = "Private member message not exposed by admin management.";
    await mutation(teammate, "messaging/messages", {
      organizationId: workspace.organizationId,
      conversationId: conversation.id,
      body: privateBody,
    });
    await signIn(page, info, workspace);
    await page.getByTestId("open-conversations").click();
    await page.getByRole("button", { name: "Manage conversations", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Manage conversations", exact: true }),
    ).toBeVisible();
    await expect(page.getByText(name, { exact: true })).toBeVisible();
    await expect(page.getByText(privateBody, { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: `Change owner of ${name}`, exact: true }).click();
    await expect(page.getByText("No other host members", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Close", exact: true }).last().click();
    await page.getByRole("button", { name: `Add people to ${name}`, exact: true }).click();
    await expect(
      page.getByRole("button", { name: `Add ${workspace.name}`, exact: true }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    const sharedName = workspace.conversationName;
    await page.getByRole("button", { name: `Add people to ${sharedName}`, exact: true }).click();
    await page.getByRole("button", { name: `Add ${workspace.member.name}`, exact: true }).click();
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: `Add people to ${sharedName}`, exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByTestId(`managed-conversation-${workspace.conversationId}`),
    ).toContainText(workspace.member.name);
    await page.getByRole("button", { name: `Change owner of ${sharedName}`, exact: true }).click();
    await page.getByRole("button", { name: workspace.member.name, exact: true }).click();
    await expect(page.getByRole("alertdialog")).toContainText(
      `Make ${workspace.member.name} the owner?`,
    );
    await page.getByRole("button", { name: "Change owner", exact: true }).click();
    await expect(
      page
        .getByTestId(`managed-conversation-${workspace.conversationId}`)
        .getByText(`Private channel · Owner: ${workspace.member.name}`, { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: `Delete ${name}`, exact: true }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Delete channel", exact: true })
      .click();
    await expect(page.getByText(name, { exact: true })).toHaveCount(0);
  } finally {
    await teammate.dispose();
  }
});
