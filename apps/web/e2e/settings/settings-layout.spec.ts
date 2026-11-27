import { test, visit } from "../test-support/fixtures";
import { captureScreenshot } from "../test-support/screenshots";
import { expect } from "@playwright/test";

test("settings use the available width without clipping app names or controls", async ({
  account,
  client,
}) => {
  const user = await client(account);
  const { page } = user;
  await visit(user, undefined, "/settings/organization/apps");
  const content = page.locator('[data-slot="settings-content"]');
  const messages = page.getByRole("region", { name: "Messages", exact: true });
  const inbox = page.getByRole("region", { name: "Inbox", exact: true });
  await expect(messages).toBeVisible();

  for (const width of [1920, 1280, 900, 390]) {
    await page.setViewportSize({ width, height: 1080 });
    await expect(async () => {
      const box = await content.boundingBox();
      const frame = await content.locator("..").boundingBox();
      expect(box!.x - frame!.x).toBeLessThanOrEqual(24);
      expect(frame!.x + frame!.width - box!.x - box!.width).toBeLessThanOrEqual(24);
      expect((await inbox.boundingBox())!.width).toBeCloseTo(
        (await messages.boundingBox())!.width,
        0,
      );
      for (const card of [messages, inbox]) {
        const title = card.locator('[data-slot="item-title"]');
        const fits = await title.evaluate((element) => {
          const range = document.createRange();
          range.selectNodeContents(element);
          return range.getBoundingClientRect().width <= element.getBoundingClientRect().width + 1;
        });
        expect(fits, "the complete app name fits its title").toBe(true);
        expect(
          await card.evaluate((element) => element.scrollWidth <= element.clientWidth),
          "the app card has no horizontal overflow",
        ).toBe(true);
      }
      const toggle = await inbox.getByRole("switch").boundingBox();
      const card = await inbox.boundingBox();
      expect(toggle!.x + toggle!.width).toBeLessThanOrEqual(card!.x + card!.width);
    }).toPass();
    await captureScreenshot(page, `settings-apps-${width}`, { fullPage: false });
  }
});

test("profile name validates, discards, and saves without changing other profile details", async ({
  account,
  client,
}) => {
  const user = await client(account);
  await visit(user, undefined, "/settings/user");
  const name = user.page.getByLabel("Full name", { exact: true });
  await expect(name).toHaveValue(account.name);
  await expect(user.page.getByRole("button", { name: "Save", exact: true })).toHaveCount(0);
  await name.fill("");
  await user.page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(name).toHaveAttribute("aria-invalid", "true");
  await expect(user.page.getByText("Enter your name.", { exact: true })).toBeVisible();
  await user.page.getByRole("button", { name: "Discard", exact: true }).click();
  await expect(name).toHaveValue(account.name);
  await expect(name).not.toHaveAttribute("aria-invalid", "true");
  await name.fill("Alex Morgan");
  await user.page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(user.page.getByRole("button", { name: "Save", exact: true })).toHaveCount(0);
  await user.page.reload();
  await expect(name).toHaveValue("Alex Morgan");
  await expect(user.page.getByText(account.email, { exact: true })).toBeVisible();
});

test("settings details stay grouped vertically at every window size", async ({
  account,
  client,
}) => {
  const user = await client(account);
  const { page } = user;
  for (const [path, first, second] of [
    ["/settings/user/preferences", "Appearance", "Messages"],
    ["/settings/organization", "Name", "Logo"],
    ["/settings/user", "Profile picture", "Name"],
  ]) {
    await visit(user, undefined, path);
    const left = page
      .getByRole("region", { name: first, exact: true })
      .filter({ has: page.getByRole("heading", { name: first, exact: true }) });
    const right = page.getByRole("region", { name: second, exact: true });
    await expect(left).toBeVisible();
    await expect(right).toBeVisible();
    for (const width of [1920, 900, 390]) {
      await page.setViewportSize({ width, height: 1080 });
      await expect(async () => {
        const a = await left.boundingBox();
        const b = await right.boundingBox();
        expect(a!.x).toBe(b!.x);
        expect(b!.y).toBeGreaterThanOrEqual(a!.y + a!.height);
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
          "settings do not overflow the window",
        ).toBe(true);
      }).toPass();
    }
  }
});
