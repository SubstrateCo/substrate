import type { CrmFromMessageResult } from "@substrate/contracts/crm/from-message";
import type { ServiceResult } from "@substrate/contracts/result";

import { result } from "../../server/integration/test-support/api";
import { readCrm, writeCrm } from "../../server/integration/test-support/crm";
import { captureCrm, selectCrmOption } from "./test-support/crm";
import { conversation, post, visit } from "./test-support/fixtures";
import { test } from "./test-support/workspace-fixtures";
import { expect } from "@playwright/test";

test("create CRM records from a private message only after audience consent and retain source navigation", async ({
  account,
  client,
}) => {
  test.setTimeout(60_000);
  const channel = await conversation(account);
  const privateBody = "Private source observation: do not copy this text into CRM.";
  const message = await post<{ id: string }>(account, "messaging/messages", {
    conversationId: channel.id,
    body: privateBody,
  });
  await result(await writeCrm(account, { action: "updateSettings", defaultCurrency: "EUR" }));
  const user = await client(account);
  const { page } = user;

  async function openCreate(kind: "account" | "contact" | "deal") {
    await visit(user, channel.id);
    const source = page.getByRole("article").filter({ hasText: privateBody });
    await source.getByRole("button", { name: "More message actions", exact: true }).click();
    await page.getByRole("menuitem", { name: "Link work or CRM", exact: true }).click();
    const picker = page.getByRole("dialog", { name: "Link existing records", exact: true });
    await picker
      .getByRole("tab", {
        name: { account: "Accounts", contact: "Contacts", deal: "Deals" }[kind],
        exact: true,
      })
      .click();
    await picker
      .getByRole("button", { name: `Create ${kind} from this message`, exact: true })
      .click();
    const editor = page.getByRole("dialog", { name: `New ${kind}`, exact: true });
    await expect(
      editor.getByLabel(kind === "deal" ? "Title" : "Name", { exact: true }),
    ).toHaveValue("");
    await expect(
      editor.getByLabel(kind === "contact" ? "Notes" : "Summary", { exact: true }),
    ).toHaveValue("");
    return editor;
  }

  const cancelled = await openCreate("account");
  await cancelled.getByLabel("Name", { exact: true }).fill("Cancelled source account");
  await cancelled.getByRole("button", { name: "Create account", exact: true }).click();
  const consent = page.getByRole("dialog", {
    name: "Create account from this message?",
    exact: true,
  });
  await expect(consent).toContainText("workspace admins");
  await captureCrm(page, "20-message-create-consent");
  await consent.getByRole("button", { name: "Cancel", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Link existing records", exact: true })
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  expect(
    await result(await readCrm(account, "accounts", { search: "Cancelled source account" })),
  ).toEqual([]);

  let createdAccountId = "";
  for (const kind of ["account", "contact", "deal"] as const) {
    const editor = await openCreate(kind);
    const name = `Reviewed source ${kind}`;
    await editor.getByLabel(kind === "deal" ? "Title" : "Name", { exact: true }).fill(name);
    if (kind === "deal") {
      await selectCrmOption(page, "Account", "Reviewed source account");
      await expect(editor.getByLabel("Currency", { exact: true })).toHaveValue("EUR");
      await expect(editor.getByRole("combobox", { name: "Stage", exact: true })).toContainText(
        "Qualification",
      );
      await captureCrm(page, "21-message-deal-draft");
    }
    await editor.getByRole("button", { name: `Create ${kind}`, exact: true }).click();
    const confirmation = page.getByRole("dialog", {
      name: `Create ${kind} from this message?`,
      exact: true,
    });
    await expect(confirmation).toContainText("private message stays separately restricted");
    const saving = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/v1/crm/from-message" &&
        response.request().method() === "POST",
    );
    await confirmation
      .getByRole("button", { name: `Create ${kind} and save source`, exact: true })
      .click();
    const response = await saving;
    expect(response.ok()).toBe(true);
    expect(response.request().postDataJSON()).toMatchObject({
      messageId: message.id,
      kind,
      consentToRecordAudience: true,
      associate: false,
    });
    const saved: ServiceResult<CrmFromMessageResult> = await response.json();
    if (!saved.success) throw new Error("Creating a CRM record from the message failed.");
    const created = saved.data;
    expect(created.entityType).toBe(kind);
    if (kind === "account") createdAccountId = created.entityId;
    await expect(confirmation).toHaveCount(0);
    const source = page.getByRole("article").filter({ hasText: privateBody });
    await source.getByRole("link", { name: `${name} Created here`, exact: true }).click();
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
    expect(new URL(page.url()).searchParams.get("recordId")).toBe(created.entityId);
    await page.reload();
    const discussion = page
      .getByRole("region", { name: "Related discussions", exact: true })
      .locator(`a[href*="messageId=${message.id}"]`);
    await expect(discussion).toBeVisible();
    if (kind === "deal") await captureCrm(page, "22-message-created-deal-source");
    await discussion.click();
    await expect(
      page
        .getByRole("complementary", { name: "Thread", exact: true })
        .getByText(privateBody, { exact: true }),
    ).toBeVisible();
  }
  const accountRecord = await result<{ account: { summary: string } }>(
    await readCrm(account, "account", { entityId: createdAccountId }),
  );
  expect(accountRecord.account.summary).toBe("");
});

test("retrying after a lost creation response keeps the same request ID and one record", async ({
  account,
  client,
}) => {
  const channel = await conversation(account);
  await post(account, "messaging/messages", {
    conversationId: channel.id,
    body: "Private source for a retry",
  });
  const user = await client(account);
  const { page } = user;
  await visit(user, channel.id);
  await page
    .getByRole("article")
    .filter({ hasText: "Private source for a retry" })
    .getByRole("button", { name: "More message actions", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "Link work or CRM", exact: true }).click();
  const picker = page.getByRole("dialog", { name: "Link existing records", exact: true });
  await picker.getByRole("tab", { name: "Accounts", exact: true }).click();
  await picker
    .getByRole("button", { name: "Create account from this message", exact: true })
    .click();
  const editor = page.getByRole("dialog", { name: "New account", exact: true });
  await editor.getByLabel("Name", { exact: true }).fill("Retry-safe source business");
  await editor.getByRole("button", { name: "Create account", exact: true }).click();
  const confirmation = page.getByRole("dialog", {
    name: "Create account from this message?",
    exact: true,
  });
  const requests: { requestId: string }[] = [];
  await page.route("**/api/v1/crm/from-message", async (route) => {
    requests.push(route.request().postDataJSON());
    if (requests.length === 1) {
      // Commit through the real backend, then simulate losing only the response to the renderer.
      const committed = await route.fetch();
      expect(committed.ok()).toBe(true);
      await route.abort("failed");
    } else await route.continue();
  });
  await confirmation
    .getByRole("button", { name: "Create account and save source", exact: true })
    .click();
  await expect(
    confirmation.getByRole("button", { name: "Create account and save source", exact: true }),
  ).toBeEnabled();
  await expect(
    confirmation.getByText("Couldn’t reach the server. Check your connection and try again.", {
      exact: true,
    }),
  ).toBeVisible();
  await confirmation
    .getByRole("button", { name: "Create account and save source", exact: true })
    .click();
  await expect(confirmation).toHaveCount(0);
  expect(requests).toHaveLength(2);
  expect(requests[1]!.requestId).toBe(requests[0]!.requestId);
  const records = await result<{ entityId: string }[]>(
    await readCrm(account, "accounts", { search: "Retry-safe source business" }),
  );
  expect(records).toHaveLength(1);
  await expect(
    page
      .getByRole("article")
      .filter({ hasText: "Private source for a retry" })
      .getByRole("link", { name: "Retry-safe source business Created here", exact: true }),
  ).toBeVisible();
});
