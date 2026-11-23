import { createCrm, writeCrm } from "../../server/integration/test-support/crm";
import { visit } from "./test-support/fixtures";
import { test } from "./test-support/workspace-fixtures";
import { expect } from "@playwright/test";

test.use({ viewport: { width: 1100, height: 700 } });

test("long contact methods remain readable and editable in a narrow desktop window", async ({
  account,
  client,
}) => {
  const contact = await createCrm(account, { action: "createContact", displayName: "Jordan Lee" });
  const value =
    "jordan.launch.customer.operations.and.release.review@customer-success.example.test";
  const saved = await writeCrm(account, {
    action: "addIdentifier",
    contactEntityId: contact.entityId,
    type: "email",
    value,
    label: "Work",
  });
  expect(saved.ok()).toBe(true);
  const user = await client(account);
  const { page } = user;
  await visit(user, undefined, "/contacts", { recordId: contact.entityId });
  const methods = page.getByRole("region", { name: "Contact methods", exact: true });
  const email = methods.getByText(value, { exact: true });
  await expect(email).toBeVisible();
  await expect
    .poll(() =>
      email.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          fits: element.scrollWidth <= element.clientWidth,
          wraps: element.clientHeight >= Number.parseFloat(style.lineHeight) * 2,
          unclipped: style.overflowY !== "hidden",
        };
      }),
    )
    .toEqual({ fits: true, wraps: true, unclipped: true });
  await methods.getByRole("button", { name: "Edit contact method", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Edit contact method", exact: true });
  await expect(editor.getByLabel("Email address", { exact: true })).toHaveValue(value);
  await editor.getByLabel("Label", { exact: true }).fill("Launch");
  await editor.getByRole("button", { name: "Save", exact: true }).click();
  await expect(editor).toHaveCount(0);
  await page.reload();
  await expect(email).toBeVisible();
  await expect(methods.getByText("Launch", { exact: true })).toBeVisible();
});
