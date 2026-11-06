import { expect, test, type Locator, type Page } from "@playwright/test";
import { openStory } from "./stories";

async function fixedDocument(page: Page) {
  const dimensions = await page.evaluate(() => ({
    height: document.documentElement.scrollHeight,
    width: document.documentElement.scrollWidth,
    viewportHeight: window.innerHeight,
    viewportWidth: window.innerWidth,
    y: window.scrollY,
  }));
  expect(dimensions.height).toBe(dimensions.viewportHeight);
  expect(dimensions.width).toBe(dimensions.viewportWidth);
  expect(dimensions.y).toBe(0);
}

async function scrollInside(log: Locator, page: Page) {
  const before = await log.evaluate((node) => ({
    top: node.scrollTop,
    overflow: node.scrollHeight - node.clientHeight,
  }));
  expect(before.overflow).toBeGreaterThan(0);
  await log.hover();
  await page.mouse.wheel(0, before.top > 0 ? -200 : 200);
  await expect.poll(() => log.evaluate((node) => node.scrollTop)).not.toBe(before.top);
  await fixedDocument(page);
}

for (const [width, height] of [
  [800, 420],
  [320, 740],
]) {
  test(`messaging frame stays fixed through pending error retry and success at ${width}x${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await openStory(page, "messaging-scenes-workspace--send-lifecycle");
    const frame = page.getByRole("main");
    const region = page.getByRole("region", { name: "general", exact: true });
    const header = region.locator("header");
    const input = page.getByRole("textbox", { name: "Message #general", exact: true });
    const surface = input.locator("..");
    await input.fill("Review plan");
    const bounds = {
      frame: await frame.boundingBox(),
      region: await region.boundingBox(),
      header: await header.boundingBox(),
      surface: await surface.boundingBox(),
    };
    const unchanged = async () => {
      expect(await frame.boundingBox()).toEqual(bounds.frame);
      expect(await region.boundingBox()).toEqual(bounds.region);
      expect(await header.boundingBox()).toEqual(bounds.header);
      expect(await surface.boundingBox()).toEqual(bounds.surface);
      await fixedDocument(page);
    };
    await scrollInside(region.getByRole("log"), page);
    await input.press("Enter");
    await expect(input).toBeDisabled();
    await unchanged();
    await page.getByRole("button", { name: "Fail send", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("Your draft is still here.");
    await expect(input).toHaveValue("Review plan");
    await unchanged();
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(input).toBeDisabled();
    await unchanged();
    await page.getByRole("button", { name: "Complete send", exact: true }).click();
    await expect(input).toHaveValue("");
    await expect(input).toBeFocused();
    await expect(region.getByRole("log")).toContainText("Review plan");
    await expect(page.getByRole("alert")).toHaveCount(0);
    await unchanged();
  });

  test(`message and thread history scroll internally at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await openStory(page, "messaging-scenes-workspace--long-content");
    const frame = page.getByRole("main");
    const frameBounds = await frame.boundingBox();
    const channel = page.getByRole("region", { name: "general", exact: true });
    await scrollInside(channel.getByRole("log"), page);
    await channel.getByRole("button", { name: "2 replies", exact: true }).first().click();
    const thread = page.getByRole("complementary", { name: "Thread", exact: true });
    const header = thread.locator("header");
    const input = thread.getByRole("textbox");
    const surface = input.locator("..");
    const headerBounds = await header.boundingBox();
    const surfaceBounds = await surface.boundingBox();
    for (let i = 0; i < 5; i++) {
      await input.fill(
        `Reply ${i + 1}: ` + "Keep the linked launch context in the thread. ".repeat(8),
      );
      await input.press("Enter");
      await expect(input).toHaveValue("");
    }
    await scrollInside(thread.getByRole("log"), page);
    expect(await frame.boundingBox()).toEqual(frameBounds);
    expect(await header.boundingBox()).toEqual(headerBounds);
    expect(await surface.boundingBox()).toEqual(surfaceBounds);
    await expect(thread.getByRole("button", { name: "Close thread", exact: true })).toBeInViewport({
      ratio: 1,
    });
  });
}
