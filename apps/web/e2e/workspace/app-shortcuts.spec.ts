import { visit } from "../test-support/fixtures";
import { test } from "../test-support/workspace-fixtures";
import { expect, type Page } from "@playwright/test";

const apps = (page: Page) => page.getByRole("navigation", { name: "Apps", exact: true });
const rail = (page: Page, name: string) =>
  apps(page).getByRole("link", { name: new RegExp(`^${name}(?:,|$)`) });

test("the macOS search shortcut stays on one line beside the input", async ({
  account,
  client,
}) => {
  const user = await client(account);
  const { page } = user;
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "platform", { get: () => "MacIntel" });
    Object.defineProperty(navigator, "userAgent", {
      get: () =>
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36",
    });
  });
  await visit(user);
  const hint = page.locator("[data-workspace-search] [data-slot=kbd-group]");
  await expect(hint).toContainText("⌘");
  await expect(hint).toContainText("K");
  await expect(async () => {
    const layout = await hint.evaluate((element) => {
      const key = element.querySelector("[data-slot=kbd]")!;
      const range = document.createRange();
      range.selectNodeContents(key);
      const text = range.getBoundingClientRect();
      const cap = key.getBoundingClientRect();
      const wrapper = element.closest("[data-slot=command-input-wrapper]")!.getBoundingClientRect();
      return {
        textTop: text.top,
        textBottom: text.bottom,
        capTop: cap.top,
        capBottom: cap.bottom,
        capRight: cap.right,
        wrapperRight: wrapper.right,
      };
    });
    expect(layout.textTop).toBeGreaterThanOrEqual(layout.capTop);
    expect(layout.textBottom).toBeLessThanOrEqual(layout.capBottom);
    expect(layout.capRight).toBeLessThanOrEqual(layout.wrapperRight);
  }).toPass();
});

test("workspace defaults to Messages and app shortcuts navigate except inside dialogs", async ({
  account,
  client,
}) => {
  const user = await client(account);
  const { page } = user;
  const since = user.events.length;
  await page.goto("/login?redirect=%2Flogin");
  await expect(page).toHaveURL(/\/messages(?:\?|$)/);
  await user.waitForEvent(since, (event) => event.type === "ready", "The workspace is connected");
  await expect(rail(page, "Messages")).toHaveAttribute("aria-current", "page");
  await rail(page, "Messages").focus();
  await page.keyboard.press("g");
  await page.keyboard.press("t");
  await expect(page).toHaveURL(/\/tasks/);
  await expect(rail(page, "Tasks")).toHaveAttribute("aria-current", "page");
  await expect(rail(page, "Messages")).not.toHaveAttribute("aria-current");
  await page.keyboard.press("g");
  await page.keyboard.press("m");
  await expect(page).toHaveURL(/\/messages/);
  await expect(rail(page, "Messages")).toHaveAttribute("aria-current", "page");
  await page.getByRole("button", { name: `Signed in as ${account.name}`, exact: true }).click();
  const menu = page.getByRole("dialog");
  await menu.getByRole("link", { name: "User settings", exact: true }).focus();
  await page.keyboard.press("g");
  await page.keyboard.press("t");
  await expect(menu).toBeVisible();
  await expect(page).toHaveURL(/\/messages/);
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
