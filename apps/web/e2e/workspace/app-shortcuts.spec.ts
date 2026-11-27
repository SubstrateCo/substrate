import { visit } from "../test-support/fixtures";
import { test } from "../test-support/workspace-fixtures";
import { expect, type Page } from "@playwright/test";

const apps = (page: Page) => page.getByRole("navigation", { name: "Apps", exact: true });
const rail = (page: Page, name: string) =>
  apps(page).getByRole("link", { name: new RegExp(`^${name}(?:,|$)`) });

test("the default workspace destination is Messages without dashboard summary requests", async ({
  account,
  client,
}) => {
  const user = await client(account);
  const summaryRequests: string[] = [];
  user.page.on("request", (request) => {
    if (/\/api\/v1\/(?:tasks|crm)\/home(?:\?|$)/.test(request.url()))
      summaryRequests.push(request.url());
  });
  await user.page.goto("/login?redirect=%2Flogin");
  await expect(user.page).toHaveURL(/\/messages(?:\?|$)/);
  await expect(rail(user.page, "Messages")).toHaveAttribute("aria-current", "page");
  await expect(rail(user.page, "Home")).toHaveCount(0);
  expect(summaryRequests).toEqual([]);
});

test("G then an app key opens that app, and the rail marks it current", async ({
  account,
  client,
}) => {
  const user = await client(account);
  const { page } = user;
  await visit(user);
  await expect(rail(page, "Messages")).toHaveAttribute("aria-current", "page");
  await page.keyboard.press("g");
  await page.keyboard.press("t");
  await expect(page).toHaveURL(/\/tasks/);
  await expect(rail(page, "Tasks")).toHaveAttribute("aria-current", "page");
  await expect(rail(page, "Messages")).not.toHaveAttribute("aria-current");
  await page.keyboard.press("g");
  await page.keyboard.press("m");
  await expect(page).toHaveURL(/\/messages/);
  await expect(rail(page, "Messages")).toHaveAttribute("aria-current", "page");
  await expect(rail(page, "Home")).toHaveCount(0);
});

test("app shortcuts leave the search field and its own shortcuts alone", async ({
  account,
  client,
}) => {
  const user = await client(account);
  const { page } = user;
  await visit(user);
  const input = page.getByRole("combobox", { name: "Search workspace", exact: true });
  await page.keyboard.press("ControlOrMeta+k");
  await expect(input).toBeFocused();
  await page.keyboard.type("gt");
  await expect(input).toHaveValue("gt");
  await expect(page).toHaveURL(/\/messages/);

  // Ctrl+Tab still switches the search type while the app shortcuts are registered.
  const types = page.getByRole("tablist", { name: "Search type", exact: true });
  await expect(types.getByRole("tab", { name: "All", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.keyboard.press("Control+Tab");
  await expect(types.getByRole("tab", { name: "Tasks", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.keyboard.press("Control+Shift+Tab");
  await expect(types.getByRole("tab", { name: "All", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(input).toBeFocused();

  // A finished sequence does not swallow the search shortcut that follows it.
  await page.keyboard.press("Escape");
  await input.blur();
  await page.keyboard.press("g");
  await page.keyboard.press("t");
  await expect(page).toHaveURL(/\/tasks/);
  await page.keyboard.press("ControlOrMeta+k");
  await expect(input).toBeFocused();

  await types.getByRole("tab", { name: "All", exact: true }).focus();
  await page.keyboard.press("Escape");
  await expect(types).toBeHidden();
  await expect(input).toBeFocused();
});

test("app shortcuts do not fire inside an open dialog", async ({ account, client }) => {
  const user = await client(account);
  const { page } = user;
  await visit(user);
  await page.getByRole("button", { name: `Signed in as ${account.name}`, exact: true }).click();
  const menu = page.getByRole("dialog");
  await menu.getByRole("link", { name: "User settings", exact: true }).focus();
  await page.keyboard.press("g");
  await page.keyboard.press("t");
  await expect(menu).toBeVisible();
  await expect(page).toHaveURL(/\/messages/);
});
