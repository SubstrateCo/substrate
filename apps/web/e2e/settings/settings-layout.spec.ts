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
      if (width === 1920) expect(box!.width).toBe(1280);
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

test("related settings share a row on wide windows and stack on narrow windows", async ({
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
        if (width === 1920) {
          expect(a!.y).toBe(b!.y);
          expect(b!.x).toBeGreaterThan(a!.x + a!.width);
        } else {
          expect(a!.x).toBe(b!.x);
          expect(b!.y).toBeGreaterThanOrEqual(a!.y + a!.height);
        }
      }).toPass();
    }
  }
});
