import { result } from "../../../server/integration/test-support/api";
import { createCrm, readCrm, writeCrm } from "../../../server/integration/test-support/crm";
import type { Actor } from "../test-support/fixtures";
import { test } from "../test-support/workspace-fixtures";
import { expect, type Page } from "@playwright/test";

type Kind = "accounts" | "deals" | "contacts";

async function record(actor: Actor, kind: Kind) {
  const name = `Private ${kind} refresh`;
  const summary = `Private ${kind} context`;
  if (kind === "contacts") {
    const created = await createCrm(actor, {
      action: "createContact",
      displayName: name,
      notes: summary,
    });
    return {
      ...created,
      name,
      summary,
      refresh: async () =>
        result(
          await writeCrm(actor, {
            action: "updateContact",
            entityId: created.entityId,
            displayName: name,
            notes: summary,
          }),
        ),
    };
  }
  if (kind === "accounts") {
    const created = await createCrm(actor, { action: "createAccount", name, summary });
    return {
      ...created,
      name,
      summary,
      refresh: async () =>
        result(
          await writeCrm(actor, {
            action: "updateAccount",
            entityId: created.entityId,
            name,
            summary,
          }),
        ),
    };
  }
  const stages = await result<{ id: string }[]>(await readCrm(actor, "pipeline"));
  const customer = await createCrm(actor, {
    action: "createAccount",
    name: "Refresh deal customer",
  });
  const fields = {
    title: name,
    summary,
    stageId: stages[0]!.id,
    accountEntityId: customer.entityId,
  };
  const created = await createCrm(actor, { action: "createDeal", ...fields });
  let version = 1;
  return {
    ...created,
    name,
    summary,
    refresh: async () =>
      result(
        await writeCrm(actor, {
          action: "updateDeal",
          entityId: created.entityId,
          expectedVersion: version++,
          ...fields,
        }),
      ),
  };
}

async function failReads(page: Page, pathname: string) {
  let status = 500;
  await page.route(
    (url) => url.pathname === pathname,
    (route) =>
      status === 200
        ? route.continue()
        : route.fulfill({
            status,
            contentType: "application/json",
            body: JSON.stringify({
              success: false,
              error: {
                code: status === 403 ? "FORBIDDEN" : "INTERNAL_ERROR",
                message: "Unreviewed private server message",
              },
            }),
          }),
  );
  return (next: number) => {
    status = next;
  };
}

for (const kind of ["accounts", "deals", "contacts"] as const) {
  test(`${kind} detail retries initial and cached failures, then clears data on access loss`, async ({
    account,
    client,
  }) => {
    const saved = await record(account, kind);
    const user = await client(account);
    const { page } = user;
    const setStatus = await failReads(
      user.page,
      kind === "contacts"
        ? "/api/v1/contacts/record"
        : `/api/v1/crm/${kind === "accounts" ? "account" : "deal"}`,
    );
    const search = new URLSearchParams({
      workspaceId: account.organizationId,
      recordId: saved.entityId,
    });
    if (kind !== "contacts") search.set("section", kind);
    const since = user.events.length;
    await user.page.goto(`${kind === "contacts" ? "/contacts" : "/crm"}?${search}`);
    const detail =
      kind === "accounts"
        ? user.page
        : user.page.getByRole("dialog", {
            name: kind === "contacts" ? "Contact" : "Deal",
            exact: true,
          });
    await expect(detail.getByText("Couldn’t load CRM", { exact: true })).toBeVisible();
    await expect(detail.getByText(saved.name, { exact: true })).toHaveCount(0);
    setStatus(200);
    await detail.getByRole("button", { name: "Try again", exact: true }).click();
    const heading = detail.getByRole("heading", { name: saved.name, exact: true });
    await expect(heading).toBeVisible();
    await expect(detail.getByText(saved.summary, { exact: true })).toBeVisible();
    await user.waitForEvent(since, (event) => event.type === "ready", "Live updates are connected");
    setStatus(500);
    await saved.refresh();
    const stale = detail.getByRole("status").filter({ hasText: "This record may be out of date." });
    await expect(stale).toBeVisible();
    await expect(heading).toBeVisible();
    await expect(detail.getByText(saved.summary, { exact: true })).toBeVisible();
    await expect(detail.getByRole("button", { name: "Edit", exact: true })).toBeVisible();
    await expect(detail.getByText("Couldn’t load CRM", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Unreviewed private server message")).toHaveCount(0);
    setStatus(200);
    await stale.getByRole("button", { name: "Try again", exact: true }).click();
    await expect(stale).toHaveCount(0);
    await expect(heading).toBeVisible();
    setStatus(403);
    await saved.refresh();
    await expect(detail.getByText("Record unavailable", { exact: true })).toBeVisible();
    await expect(heading).toHaveCount(0);
    await expect(detail.getByText(saved.summary, { exact: true })).toHaveCount(0);
    await expect(detail.getByRole("button", { name: "Edit", exact: true })).toHaveCount(0);
    await expect(detail.getByRole("button", { name: "Try again", exact: true })).toHaveCount(0);
  });
}

for (const kind of ["accounts", "deals"] as const) {
  test(`${kind} collection retries initial and cached failures, then clears rows on access loss`, async ({
    account,
    client,
  }) => {
    const saved = await record(account, kind);
    const user = await client(account);
    const { page } = user;
    const setStatus = await failReads(page, `/api/v1/crm/${kind}`);
    const search = new URLSearchParams({
      workspaceId: account.organizationId,
      section: kind,
    });
    const since = user.events.length;
    await page.goto(`/crm?${search}`);
    await expect(page.getByText(`Couldn’t load ${kind}`, { exact: true })).toBeVisible();
    const name = page.getByText(saved.name, { exact: true });
    await expect(name).toHaveCount(0);
    setStatus(200);
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await expect(name).toBeVisible();
    await user.waitForEvent(since, (event) => event.type === "ready", "Live updates are connected");
    if (kind === "deals") {
      // The list has its own query, which loads when the list is first shown. Load it before
      // testing cached data.
      await page.getByRole("radio", { name: "List", exact: true }).click();
      await expect(name).toBeVisible();
      await page.getByRole("radio", { name: "Pipeline", exact: true }).click();
      await expect(name).toBeVisible();
    }
    setStatus(500);
    await saved.refresh();
    const stale = page.getByRole("status").filter({ hasText: `These ${kind} may be out of date.` });
    await expect(stale).toBeVisible();
    await expect(name).toBeVisible();
    if (kind === "deals") {
      await page.getByRole("radio", { name: "List", exact: true }).click();
      await expect(name).toBeVisible();
    }
    setStatus(200);
    await stale.getByRole("button", { name: "Try again", exact: true }).click();
    await expect(stale).toHaveCount(0);
    await expect(name).toBeVisible();
    setStatus(403);
    await saved.refresh();
    await expect(
      page.getByText(`${kind.charAt(0).toUpperCase()}${kind.slice(1)} unavailable`, {
        exact: true,
      }),
    ).toBeVisible();
    await expect(name).toHaveCount(0);
    await expect(page.getByText(/Page 1 ·/)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Try again", exact: true })).toHaveCount(0);
  });
}
