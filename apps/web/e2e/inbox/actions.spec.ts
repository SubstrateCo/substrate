import { isolateContext } from "../test-support/fixtures";
import { test } from "../test-support/inbox";
import { expect } from "@playwright/test";

test("left checkboxes select conversations without opening them; only unconfirmed rows need retry", async ({
  inbox: page,
  gmailPages,
}) => {
  const list = page.getByRole("region", { name: "Messages", exact: true });
  const tools = page.getByRole("group", { name: "Conversation actions" });
  const all = tools.getByRole("checkbox", { name: "Select all conversations on this page" });
  const proof = list.getByRole("checkbox", { name: /^Select conversation: Atlas cover proofs/ });
  const notes = list.getByRole("checkbox", { name: /^Select conversation: Notes from ÉCOLE/ });
  const row = list.getByRole("button", { name: /Atlas cover proofs/ });
  const notesRow = list.getByRole("button", { name: /Notes from ÉCOLE/ });
  await all.check();
  await expect(tools).toContainText("4 conversations selected");
  await expect(tools.getByRole("button", { name: "Move to Trash" })).toBeDisabled();
  await tools.getByRole("button", { name: "Reconnect to enable Gmail actions" }).click();
  const manage = page.getByRole("dialog", { name: "Manage mailboxes" });
  await expect(manage.getByRole("region", { name: "alex.home@personal.example" })).toContainText(
    "Read-only Gmail access",
  );
  await manage.getByRole("button", { name: "Close", exact: true }).last().click();
  await all.uncheck();
  await proof.focus();
  await page.keyboard.press("Space");
  await notes.check();
  await expect(all).toHaveAttribute("aria-checked", "mixed");
  await expect(page.getByRole("complementary", { name: "Message reader" })).toHaveCount(0);
  gmailPages.refuseWrite = "unicode";
  await tools.getByRole("button", { name: "Mark as read", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("1 conversation");
  await expect(proof).not.toBeChecked();
  await expect(row).not.toHaveAccessibleName(/^Unread\./);
  await expect(notes).toBeChecked();
  await expect(notesRow).toHaveAccessibleName(/^Unread\./);
  gmailPages.refuseWrite = undefined;
  await page.getByRole("button", { name: "Retry remaining" }).click();
  await expect(notesRow).not.toHaveAccessibleName(/^Unread\./);
  await expect(tools).toContainText("Select conversations");
  await proof.check();
  await notes.check();
  await tools.getByRole("button", { name: "Mark as unread", exact: true }).click();
  await expect(row.getByTitle(/3 messages in this conversation · 3 unread/)).toBeVisible();
  await expect(notesRow).toHaveAccessibleName(/^Unread\./);
  await proof.check();
  await notes.check();
  await tools.getByRole("button", { name: "Move to Trash" }).click();
  const confirm = page.getByRole("dialog", { name: "Move 2 conversations to Trash?" });
  await confirm.getByRole("button", { name: "Cancel" }).click();
  await expect(tools).toContainText("2 conversations selected");
  await tools.getByRole("button", { name: "Move to Trash" }).click();
  await confirm.getByRole("button", { name: "Move to Trash" }).click();
  await expect(list.getByRole("checkbox")).toHaveCount(2);
  await expect(row).toHaveCount(0);
  const views = page.getByRole("navigation", { name: "Mail views" });
  await views.getByRole("button", { name: "Sent", exact: true }).click();
  await expect(page.getByRole("button", { name: /Atlas cover proofs/ })).toHaveCount(0);
  await views.getByRole("button", { name: "Trash", exact: true }).click();
  await expect(row).toBeVisible();
  await expect(notesRow).toBeVisible();
});

test("only a foreground dwell marks the expanded email read; manual unread sticks and read-only mail stays unread", async ({
  inbox: page,
}) => {
  isolateContext(page);
  await page.clock.install();
  const list = page.getByRole("region", { name: "Messages", exact: true });
  const proof = list.getByRole("button", { name: /Atlas cover proofs/ });
  const reader = page.getByRole("complementary", { name: "Message reader" });
  const read = reader.getByRole("button", { name: "Mark as read", exact: true });
  const unread = reader.getByRole("button", { name: "Mark as unread", exact: true });
  const close = reader.getByRole("button", { name: "Close message" });
  const check = list.getByRole("checkbox", { name: /Select conversation: Atlas cover proofs/ });
  await check.check();
  await page
    .getByRole("group", { name: "Conversation actions" })
    .getByRole("button", { name: "Mark as unread" })
    .click();
  const count = (n: number) => proof.getByTitle(`3 messages in this conversation · ${n} unread`);
  await expect(count(3)).toBeVisible();
  await proof.click();
  await expect(read).toBeEnabled();
  await page.clock.fastForward(650);
  await close.click();
  await page.clock.fastForward(2200);
  await expect(count(3)).toBeVisible();
  await proof.click();
  await expect(read).toBeEnabled();
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await page.clock.fastForward(2200);
  await expect(count(3)).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.getByRole("button", { name: /^Signed in as / }).click();
  const menu = page.getByRole("dialog", { name: "User actions" });
  await menu.getByRole("link", { name: "User settings" }).focus();
  await page.clock.fastForward(2200);
  await expect(count(3)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await page.clock.fastForward(700);
  await expect(count(3)).toBeVisible();
  await expect(unread).toBeEnabled({ timeout: 8000 });
  await expect(count(2)).toBeVisible();
  await unread.click();
  await expect(count(3)).toBeVisible();
  await page.clock.fastForward(3000);
  await expect(read).toBeEnabled();
  await expect(count(3)).toBeVisible();
  await close.click();
  const readonly = list.getByRole("button", { name: /Dates for the gallery visit/ });
  await readonly.click();
  await expect(read).toBeDisabled();
  await page.clock.fastForward(3000);
  await close.click();
  await expect(readonly).toHaveAccessibleName(/^Unread\./);
});
