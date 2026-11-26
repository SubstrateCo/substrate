import { captureScreenshot } from "./test-support/capture";
import { mutation, test } from "./test-support/fixtures";
import { signIn } from "./test-support/navigation";
import { expect } from "@playwright/test";

test("Expo web preview: account relationships, deal forms, and persisted deal outcome", async ({
  page,
  workspace,
}, info) => {
  await signIn(page, info, workspace);
  await page.goto(
    `/?${new URLSearchParams({
      tab: "crm",
      record: JSON.stringify({ kind: "account", id: workspace.accountId }),
    })}`,
  );
  await expect(page.getByTestId("account-detail")).toBeVisible();
  await captureScreenshot(page, info, "account-detail");
  await page.getByRole("button", { name: "Edit Account", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Edit account", exact: true })).toBeVisible();
  await captureScreenshot(page, info, "account-edit");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "More Account actions", exact: true }).click();
  await captureScreenshot(page, info, "account-actions");
  await page.getByRole("button", { name: "Archive account", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toContainText("Archive this account?");
  await captureScreenshot(page, info, "account-archive-confirmation");
  await page.getByRole("alertdialog").getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Add person", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Add person", exact: true })).toBeVisible();
  await captureScreenshot(page, info, "account-add-person");
  await page.getByRole("button", { name: /^Contact:/ }).click();
  await expect(
    page.getByRole("button", { name: "Jordan Lee · test contact", exact: true }),
  ).toBeVisible();
  await captureScreenshot(page, info, "account-contact-picker");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Jordan Lee · test contact", exact: true }).click();
  await expect(page.getByRole("button", { name: "Open contact", exact: true })).toBeVisible();
  await captureScreenshot(page, info, "account-person-actions");
  await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();

  await page.getByRole("button", { name: "New deal", exact: true }).click();
  await expect(page.getByRole("heading", { name: "New deal", exact: true })).toBeVisible();
  await captureScreenshot(page, info, "deal-new");
  for (const [label, expected] of [
    ["Account", "Northstar Studio · synthetic"],
    ["Primary contact", "Jordan Lee · test contact"],
  ]) {
    await page.getByRole("button", { name: new RegExp(`^${label}:`) }).click();
    await expect(page.getByRole("button", { name: expected, exact: true })).toBeVisible();
    await captureScreenshot(page, info, `deal-${label.toLowerCase().replaceAll(" ", "-")}-picker`);
    await page.getByRole("button", { name: "Close", exact: true }).click();
  }
  await page.getByRole("button", { name: /^Stage:/ }).click();
  await expect(page.getByRole("heading", { name: "Stage", exact: true })).toBeVisible();
  await captureScreenshot(page, info, "deal-stage-picker");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page
    .getByRole("button", { name: "Mobile design partnership · synthetic", exact: true })
    .click();
  await expect(page.getByTestId("deal-detail")).toBeVisible();
  await captureScreenshot(page, info, "deal-detail");
  await page.getByRole("button", { name: "Edit Deal", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Edit deal", exact: true })).toBeVisible();
  await captureScreenshot(page, info, "deal-edit");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "More Deal actions", exact: true }).click();
  await captureScreenshot(page, info, "deal-actions");
  await page.getByRole("button", { name: "Archive deal", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toContainText("Archive this deal?");
  await captureScreenshot(page, info, "deal-archive-confirmation");
  await page.getByRole("alertdialog").getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "More Deal actions", exact: true }).click();
  await page.getByRole("button", { name: "Move stage or close", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Move deal", exact: true })).toBeVisible();
  await captureScreenshot(page, info, "deal-move");
  await page.getByRole("button", { name: /^Outcome:/ }).click();
  await captureScreenshot(page, info, "deal-outcome-picker");
  await page.getByRole("button", { name: "Lost", exact: true }).click();
  await expect(page.getByLabel("Lost reason", { exact: true })).toBeVisible();
  await captureScreenshot(page, info, "deal-lost-reason");
  await page.getByRole("button", { name: /^Outcome:/ }).click();
  await page.getByRole("button", { name: "Won", exact: true }).click();
  await page.getByRole("button", { name: "Move", exact: true }).click();
  await expect(page.getByTestId("deal-detail").getByText("Won", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("deal-detail").getByText("Won", { exact: true })).toBeVisible();
  await captureScreenshot(page, info, "deal-won-persisted");
});

test("Expo web preview: affiliation edits, deal participants, and scoped interaction history persist", async ({
  page,
  workspace,
}, info) => {
  const secondary = await mutation<{ entityId: string }>(workspace.request, "contacts/mutations", {
    action: "createContact",
    organizationId: workspace.organizationId,
    displayName: "Casey · secondary deal contact",
  });
  await signIn(page, info, workspace);
  await page.goto(
    `/?${new URLSearchParams({
      tab: "crm",
      record: JSON.stringify({ kind: "account", id: workspace.accountId }),
    })}`,
  );
  const account = page.getByTestId("account-detail");
  await account.getByRole("button", { name: "Jordan Lee · test contact", exact: true }).click();
  await page.getByRole("button", { name: "Edit affiliation", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Edit affiliation", exact: true })).toBeVisible();
  await expect(page.getByLabel("Role", { exact: true })).toHaveValue("Design partner");
  await page.getByLabel("Role", { exact: true }).fill("Project sponsor");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    account.getByRole("button", { name: "Jordan Lee · test contact", exact: true }),
  ).toContainText("Project sponsor");
  await page.reload();
  await expect(
    account.getByRole("button", { name: "Jordan Lee · test contact", exact: true }),
  ).toContainText("Project sponsor");

  await account
    .getByRole("button", { name: "Mobile design partnership · synthetic", exact: true })
    .click();
  const deal = page.getByTestId("deal-detail");
  await expect(deal.getByRole("tab", { name: "Explicitly linked", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await deal.getByRole("tab", { name: "Related contacts", exact: true }).click();
  await expect(deal.getByRole("tab", { name: "Related contacts", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(deal.getByRole("tab", { name: "Explicitly linked", exact: true })).toHaveAttribute(
    "aria-selected",
    "false",
  );
  await expect(
    deal.getByRole("button", {
      name: "Discussed launch scope and the next design review.",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit Deal", exact: true }).click();
  await page.getByRole("button", { name: /^Additional contact:/ }).click();
  await page.getByRole("button", { name: "Casey · secondary deal contact", exact: true }).click();
  await page
    .getByRole("button", { name: "Remove Jordan Lee · test contact from deal", exact: true })
    .click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    deal.getByRole("button", { name: "Casey · secondary deal contact", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    deal.getByRole("button", { name: "Casey · secondary deal contact", exact: true }),
  ).toBeVisible();
  await expect(
    deal.getByRole("button", { name: "Jordan Lee · test contact", exact: true }),
  ).toHaveCount(0);

  const response = await workspace.request.get("/api/v1/crm/deal", {
    params: { organizationId: workspace.organizationId, entityId: workspace.dealId },
  });
  expect(response.ok()).toBe(true);
  const result = await response.json();
  expect(result.success).toBe(true);
  expect(
    result.data.contacts.map((row: { contact: { entityId: string }; isPrimary: boolean }) => ({
      id: row.contact.entityId,
      primary: row.isPrimary,
    })),
  ).toEqual([{ id: secondary.entityId, primary: false }]);
});

test("Expo web preview: CRM currency settings persist without changing existing deals", async ({
  page,
  workspace,
}, info) => {
  await signIn(page, info, workspace);
  await page.getByRole("tab", { name: "CRM", exact: true }).click();
  await page.getByRole("button", { name: "CRM settings", exact: true }).click();
  await page.getByLabel("Default currency", { exact: true }).fill("EUR");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("heading", { name: "CRM settings", exact: true })).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "CRM settings", exact: true }).click();
  await expect(page.getByLabel("Default currency", { exact: true })).toHaveValue("EUR");

  const response = await workspace.request.get("/api/v1/crm/deal", {
    params: { organizationId: workspace.organizationId, entityId: workspace.dealId },
  });
  expect(response.ok()).toBe(true);
  const result = await response.json();
  expect(result.success).toBe(true);
  expect(result.data.deal.currency).toBe("USD");
});

test("Expo web preview: contextual record links persist, navigate, and can be removed without deleting records", async ({
  page,
  workspace,
}, info) => {
  await signIn(page, info, workspace);
  const location = `/?${new URLSearchParams({
    tab: "crm",
    record: JSON.stringify({ kind: "account", id: workspace.accountId }),
  })}`;
  await page.goto(location);
  const account = page.getByTestId("account-detail");
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: "More Account actions", exact: true }).click();
  await page.getByRole("button", { name: "Copy record link", exact: true }).click();
  await expect(page.getByText("Link copied", { exact: true })).toBeVisible();
  await captureScreenshot(page, info, "crm-record-link-copied");
  const copied = new URL(await page.evaluate(() => navigator.clipboard.readText()));
  expect(copied.searchParams.get("workspaceId")).toBe(workspace.organizationId);
  expect(copied.searchParams.get("recordId")).toBe(workspace.accountId);
  expect(copied.searchParams.has("token")).toBe(false);
  await account.getByRole("button", { name: "Link record", exact: true }).click();
  await page.getByLabel("Search records", { exact: true }).fill("Mobile launch");
  await page.getByRole("button", { name: /^Record:/ }).click();
  await expect(
    page.getByRole("button", { name: "Mobile launch · synthetic", exact: true }),
  ).toBeVisible();
  await captureScreenshot(page, info, "crm-record-link-picker");
  await page.getByRole("button", { name: "Mobile launch · synthetic", exact: true }).click();
  await page.getByRole("button", { name: "Link", exact: true }).click();
  const links = account.getByTestId("record-connections");
  await expect(
    links.getByRole("button", { name: "Mobile launch · synthetic", exact: true }),
  ).toBeVisible();
  await links
    .getByRole("button", { name: "Mobile launch · synthetic", exact: true })
    .scrollIntoViewIfNeeded();
  await captureScreenshot(page, info, "crm-record-links-saved");
  await page.reload();
  await links.getByRole("button", { name: "Mobile launch · synthetic", exact: true }).click();
  await expect(page.getByRole("button", { name: "Open linked record", exact: true })).toBeVisible();
  await captureScreenshot(page, info, "crm-record-link-actions");
  await page.getByRole("button", { name: "Open linked record", exact: true }).click();
  await expect(page.getByTestId("project-detail")).toBeVisible();
  await page.goto(location);
  await links.getByRole("button", { name: "Mobile launch · synthetic", exact: true }).click();
  await page.getByRole("button", { name: "Remove record link", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toContainText("Remove this record link?");
  await captureScreenshot(page, info, "crm-record-link-remove-confirmation");
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Remove link", exact: true })
    .click();
  await expect(
    links.getByRole("button", { name: "Mobile launch · synthetic", exact: true }),
  ).toHaveCount(0);
  await captureScreenshot(page, info, "crm-record-link-removed");
  const project = await workspace.request.get("/api/v1/tasks/project", {
    params: { organizationId: workspace.organizationId, projectEntityId: workspace.projectId },
  });
  expect(project.ok()).toBe(true);
});

test("Expo web preview: existing CRM reports, interaction directories, activity and private exports are reachable", async ({
  page,
  workspace,
}, info) => {
  await signIn(page, info, workspace);
  await page.getByRole("tab", { name: "CRM", exact: true }).click();
  await page.getByRole("tab", { name: "Reports", exact: true }).click();
  await expect(page.getByText("Close results", { exact: true })).toBeVisible();
  await page.getByText("Close results", { exact: true }).scrollIntoViewIfNeeded();
  await captureScreenshot(page, info, "crm-reports-overview");
  await expect(page.getByText("Follow-up exceptions", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Mobile design partnership · synthetic", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Mobile design partnership · synthetic", exact: true })
    .scrollIntoViewIfNeeded();
  await captureScreenshot(page, info, "crm-reports-open-cohort");
  const reportFilters = page.getByLabel("Report filters", { exact: true });
  await expect(
    reportFilters.getByRole("button", { name: /^Close date is between / }),
  ).toBeVisible();
  await reportFilters.getByRole("button", { name: "Stale after is 30 days", exact: true }).click();
  const staleDays = page.getByLabel("Stale after (days)", { exact: true });
  await staleDays.fill("0");
  await expect(page.getByText("Use a whole number from 1 to 3650.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Apply", exact: true })).toBeDisabled();
  await captureScreenshot(page, info, "crm-reports-stale-editor-invalid");
  await staleDays.fill("14");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(
    reportFilters.getByRole("button", { name: "Stale after is 14 days", exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Interactions", exact: true }).click();
  await page.getByRole("tab", { name: "Activity", exact: true }).click();
  await expect(page.getByText("Contacts reached", { exact: true })).toBeVisible();
  await captureScreenshot(page, info, "crm-interaction-activity-totals");
  await page
    .getByRole("button", { name: /^\d{4}-\d{2}-\d{2}$/ })
    .first()
    .click();
  const dayInteraction = page.getByRole("button", {
    name: "Meeting: Discussed launch scope and the next design review.",
    exact: true,
  });
  await expect(dayInteraction).toBeVisible();
  await dayInteraction.scrollIntoViewIfNeeded();
  await captureScreenshot(page, info, "crm-interaction-activity-day");
  await page.getByRole("tab", { name: "People", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Jordan Lee · test contact", exact: true }),
  ).toBeVisible();
  await captureScreenshot(page, info, "crm-interaction-people-directory");
  await page.getByRole("tab", { name: "Organizations", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Northstar Studio · synthetic", exact: true }),
  ).toBeVisible();
  await captureScreenshot(page, info, "crm-interaction-organizations-directory");
  await page.getByRole("tab", { name: "Accounts", exact: true }).click();
  await page.getByRole("button", { name: "Export accounts", exact: true }).click();
  await page.getByRole("button", { name: /^Format:/ }).click();
  await page.getByRole("button", { name: "JSON", exact: true }).click();
  await page.getByRole("switch", { name: "Save private workspace data", exact: true }).click();
  await captureScreenshot(page, info, "crm-accounts-export-confirmed");
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe("accounts.json");
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  expect(JSON.parse(Buffer.concat(chunks).toString("utf8"))).toMatchObject([
    { entityId: workspace.accountId, name: "Northstar Studio · synthetic" },
  ]);
});
