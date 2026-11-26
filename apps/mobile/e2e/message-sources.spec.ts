import { captureScreenshot } from "./test-support/capture";
import { test } from "./test-support/fixtures";
import { openMessageActions, sourceBody } from "./test-support/messages";
import { closePanel, signIn } from "./test-support/navigation";
import { expect } from "@playwright/test";

test("Expo web preview: create a task from a message after project-audience consent", async ({
  page,
  workspace,
}, info) => {
  await signIn(page, info, workspace);
  await page.goto(`/?${new URLSearchParams({ conversationId: workspace.conversationId })}`);
  await openMessageActions(page, workspace.messageId);
  await page.getByRole("button", { name: "Create task", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Create task in project", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Mobile launch · synthetic", exact: true }),
  ).toBeVisible();
  await captureScreenshot(page, info, "message-source-task-project-picker");
  await page.getByRole("button", { name: "Mobile launch · synthetic", exact: true }).click();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Description", { exact: true })).toHaveValue("");
  await captureScreenshot(page, info, "message-source-task-form");
  const title = "Prepare Jordan's launch handoff · synthetic source task";
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page
    .getByLabel("Description", { exact: true })
    .fill("Approved work summary, not a copy of the private message.");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  const consent = page.getByRole("alertdialog");
  await expect(consent).toContainText("Create task in Mobile launch · synthetic?");
  await expect(consent).toContainText("message access does not change");
  await captureScreenshot(page, info, "message-source-task-audience-confirmation");
  const saving = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.endsWith("/context/source-tasks") &&
      response.request().method() === "POST",
  );
  await consent.getByRole("button", { name: "Create task", exact: true }).click();
  const response = await saving;
  expect(response.ok()).toBe(true);
  expect(response.request().postDataJSON()).toMatchObject({
    messageId: workspace.messageId,
    projectEntityId: workspace.projectId,
    title,
  });
  await expect(
    page.getByTestId("task-detail").getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByTestId("task-detail").getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  await captureScreenshot(page, info, "message-source-task-persisted");
  await closePanel(page);
  await expect(
    page.getByTestId(`message-${workspace.messageId}`).getByRole("button", {
      name: /^Prepare Jordan's launch handoff · synthetic source task, Created here/,
    }),
  ).toBeVisible();
  await captureScreenshot(page, info, "message-created-task-source-reference");
});

test("Expo web preview: create source-aware contact, account, and deal with audience confirmation", async ({
  page,
  workspace,
}, info) => {
  await signIn(page, info, workspace);
  await page.goto(`/?${new URLSearchParams({ conversationId: workspace.conversationId })}`);
  for (const kind of ["contact", "account", "deal"] as const) {
    await openMessageActions(page, workspace.messageId);
    await page.getByRole("button", { name: "Create CRM record", exact: true }).click();
    const chooser = page.getByRole("dialog", { name: "Create CRM record", exact: true });
    await expect(chooser).toBeVisible();
    if (kind === "contact") await captureScreenshot(page, info, "message-source-crm-kind-picker");
    await chooser
      .getByRole("button", { name: kind[0]!.toUpperCase() + kind.slice(1), exact: true })
      .click();
    await expect(page.getByRole("heading", { name: `New ${kind}`, exact: true })).toBeVisible();
    const name = `Message-created ${kind} · synthetic`;
    const nameLabel = { contact: "Display name", account: "Name", deal: "Title" }[kind];
    const nameField = page.getByLabel(nameLabel, { exact: true });
    const summary = page.getByLabel(kind === "contact" ? "Notes" : "Summary", { exact: true });
    await expect(nameField).toHaveValue("");
    await expect(summary).toHaveValue("");
    await captureScreenshot(page, info, `message-source-${kind}-form`);
    await nameField.fill(name);
    if (kind === "deal") {
      await page.getByRole("button", { name: /^Account:/ }).click();
      await page.getByRole("button", { name: "Northstar Studio · synthetic", exact: true }).click();
    }
    await page.getByRole("button", { name: "Create", exact: true }).click();
    const consent = page.getByRole("alertdialog");
    await expect(consent).toContainText(`Create ${kind} from this message?`);
    await expect(consent).toContainText("message itself stays restricted");
    await captureScreenshot(page, info, `message-source-${kind}-audience-confirmation`);
    const saving = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname.endsWith("/crm/from-message") &&
        response.request().method() === "POST",
    );
    await consent.getByRole("button", { name: `Create ${kind}`, exact: true }).click();
    const response = await saving;
    expect(response.ok()).toBe(true);
    expect(response.request().postDataJSON()).toMatchObject({
      messageId: workspace.messageId,
      kind,
      consentToRecordAudience: true,
    });
    const detail = page.getByTestId(`${kind}-detail`);
    await expect(detail.getByRole("heading", { name, exact: true })).toBeVisible();
    await page.reload();
    await expect(detail.getByRole("heading", { name, exact: true })).toBeVisible();
    await captureScreenshot(page, info, `message-source-${kind}-persisted`);
    const backlink = detail.getByRole("button", { name: sourceBody, exact: true });
    await expect(backlink).toBeVisible();
    await backlink.click();
    await expect(page.getByTestId("record-panel")).toHaveCount(0);
    await expect(page.getByTestId(`message-${workspace.messageId}`)).toBeVisible();
  }
  await captureScreenshot(page, info, "message-created-crm-source-references");
});

test("Expo web preview: publish an approved interaction from a message with explicit consent", async ({
  page,
  workspace,
}, info) => {
  await signIn(page, info, workspace);
  await page.goto(`/?${new URLSearchParams({ conversationId: workspace.conversationId })}`);
  await openMessageActions(page, workspace.messageId);
  await page.getByRole("button", { name: "Log as interaction", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Record interaction from discussion", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Approved summary", { exact: true })).toHaveValue("");
  await captureScreenshot(page, info, "message-publish-interaction-form");
  await page.getByRole("button", { name: /^Contact:/ }).click();
  await expect(
    page.getByRole("button", { name: "Jordan Lee · test contact", exact: true }),
  ).toBeVisible();
  await captureScreenshot(page, info, "message-publication-contact-picker");
  await page.getByRole("button", { name: "Jordan Lee · test contact", exact: true }).click();
  const summary = "Jordan confirmed the next design review · synthetic publication";
  await page.getByLabel("Approved summary", { exact: true }).fill(summary);
  await expect(page.getByRole("button", { name: "Publish", exact: true })).toBeDisabled();
  await captureScreenshot(page, info, "message-publication-summary-before-consent");
  await page.getByRole("switch", { name: "Publish to the workspace", exact: true }).click();
  await captureScreenshot(page, info, "message-publication-approved-audience");
  const saving = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.endsWith("/context/interactions/mutations") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  const response = await saving;
  expect(response.ok()).toBe(true);
  expect(response.request().postDataJSON()).toMatchObject({
    action: "publishInteraction",
    messageId: workspace.messageId,
    contactEntityId: workspace.contactId,
    consentToContactAudience: true,
    summary,
  });
  await expect(page.getByTestId("interaction-detail")).toContainText(summary);
  await page.reload();
  await expect(page.getByTestId("interaction-detail")).toContainText(summary);
  await expect(page.getByTestId("interaction-detail")).toContainText("Published from a message");
  await captureScreenshot(page, info, "message-published-interaction-persisted");
});
