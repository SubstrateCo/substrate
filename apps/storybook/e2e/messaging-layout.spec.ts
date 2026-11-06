import { expect, test } from "@playwright/test";
import { openStory } from "./stories";

test("messaging has one channel action and a compact growing composer", async ({ page }) => {
  await openStory(page, "messaging-scenes-workspace--public-channel");
  const sidebar = page.getByRole("complementary", { name: "Conversations" });
  await expect(sidebar.getByRole("button", { name: "Create channel", exact: true })).toHaveCount(1);
  const input = page.getByRole("textbox", { name: "Message #general", exact: true });
  const surface = input.locator("..");
  const empty = (await surface.boundingBox())!;
  expect(empty.height).toBeLessThanOrEqual(120);
  expect(empty.height).toBeGreaterThanOrEqual(90);
  await input.fill(Array.from({ length: 8 }, (_, i) => `Line ${i + 1}`).join("\n"));
  await expect
    .poll(async () => (await surface.boundingBox())!.height)
    .toBeGreaterThan(empty.height);
});

test("desktop resize handles preserve channel and thread drafts", async ({ page }) => {
  await openStory(page, "messaging-scenes-workspace--thread-open");
  const channel = page.getByRole("textbox", { name: "Message #general", exact: true });
  const thread = page.getByRole("complementary", { name: "Thread", exact: true });
  await channel.fill("Channel draft");
  await thread.getByRole("textbox").fill("Thread draft");
  for (const name of ["Resize conversations sidebar", "Resize thread"]) {
    const handle = page.getByRole("separator", { name, exact: true });
    await handle.focus();
    await expect(handle).toBeFocused();
    const before = (await handle.boundingBox())!.x;
    await handle.press("ArrowLeft");
    await expect.poll(async () => (await handle.boundingBox())!.x).not.toBe(before);
    const box = (await handle.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 35, box.y + box.height / 2, { steps: 8 });
    await page.mouse.up();
    await expect.poll(async () => (await handle.boundingBox())!.x).not.toBe(box.x);
  }
  await expect(channel).toHaveValue("Channel draft");
  await expect(thread.getByRole("textbox")).toHaveValue("Thread draft");
  await page.setViewportSize({ width: 800, height: 900 });
  await expect(thread.getByRole("textbox")).toHaveValue("Thread draft");
  await expect(page.getByRole("button", { name: "Close thread" })).toBeFocused();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(channel).toHaveValue("Channel draft");
  await expect(thread.getByRole("textbox")).toHaveValue("Thread draft");
  await thread.getByRole("button", { name: "Close thread" }).click();
  await page.getByRole("button", { name: "2 replies", exact: true }).click();
  await expect(thread.getByRole("textbox")).toHaveValue("Thread draft");
  await expect(channel).toHaveValue("Channel draft");
  const other = page
    .getByRole("region", { name: "general", exact: true })
    .getByRole("article")
    .filter({ hasText: "The API is ready:" });
  await other.getByRole("button", { name: "Reply in thread", exact: true }).click();
  await expect(thread.getByRole("textbox")).toHaveValue("");
  await thread.getByRole("textbox").fill("Other thread draft");
  await page.getByRole("button", { name: "2 replies", exact: true }).click();
  await expect(thread.getByRole("textbox")).toHaveValue("Thread draft");
});

test("mobile thread focuses its close control and skips the covered conversation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 800, height: 900 });
  await openStory(page, "messaging-scenes-workspace--public-channel");
  const opener = page.getByRole("button", { name: "2 replies", exact: true });
  await opener.click();
  const close = page.getByRole("button", { name: "Close thread" });
  await expect(close).toBeFocused();
  expect(
    (await page.getByRole("complementary", { name: "Thread", exact: true }).boundingBox())!.y,
  ).toBeLessThan(100);
  await expect(page.getByRole("textbox", { name: "Message #general", exact: true })).toHaveCount(0);
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => !!document.activeElement?.closest("[inert]"))).toBe(false);
  }
  await expect(page.getByRole("complementary", { name: "Conversations" })).toBeVisible();
  await close.click();
  await expect(opener).toBeFocused();
  await expect(page.getByRole("textbox", { name: "Message #general", exact: true })).toBeVisible();
});

for (const width of [320, 390]) {
  test(`mobile messaging uses the full pane width at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 740 });
    await openStory(page, "messaging-scenes-workspace--public-channel");
    const region = page.getByRole("region", { name: "general", exact: true });
    expect((await region.boundingBox())!.width).toBeGreaterThan(width - 80);
    expect((await region.boundingBox())!.y).toBeLessThan(100);
    expect((await region.boundingBox())!.height).toBeGreaterThan(640);
    await expect(
      page.getByRole("separator", { name: "Resize conversations sidebar" }),
    ).toBeHidden();
    await page.getByRole("button", { name: "Show conversations" }).click();
    await expect(region).toBeHidden();
    expect(
      (await page.getByRole("complementary", { name: "Conversations" }).boundingBox())!.width,
    ).toBeGreaterThan(width - 80);
  });
}

test("reference popup stays inside a short window and keeps filters usable", async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 420 });
  await openStory(page, "messaging-scenes-reference-composer--constrained");
  const popup = page.getByRole("dialog", { name: "Insert workspace reference" });
  await expect(popup).toBeVisible();
  const bounds = (await popup.boundingBox())!;
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(420);
  await expect(popup.getByRole("button", { name: "Projects", exact: true })).toBeInViewport({
    ratio: 1,
  });
  await popup.getByRole("button", { name: "Projects", exact: true }).click();
  await expect(popup.getByRole("option").first()).toBeInViewport();
});

test("empty workspace renders its notice and working first-conversation actions", async ({
  page,
}) => {
  await openStory(page, "messaging-scenes-workspace--empty-workspace");
  await expect(page.getByRole("heading", { name: "Your conversations start here" })).toBeVisible();
  await page.getByRole("button", { name: "New direct message", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "New direct message", exact: true }),
  ).toBeVisible();
  await openStory(page, "messaging-scenes-workspace--empty-channel");
  await expect(
    page.getByRole("heading", { name: "Welcome to #general", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Message #general", exact: true })).toBeVisible();
});

test("reply action without replies is icon-only but keeps its accessible name", async ({
  page,
}) => {
  await openStory(page, "messaging-scenes-workspace--public-channel");
  const action = page.getByRole("button", { name: "Reply in thread", exact: true }).first();
  await expect(action).toHaveText("");
  await expect(action).toHaveAttribute("title", "Reply in thread");
  const count = page.getByRole("button", { name: "2 replies", exact: true });
  await expect(count).toBeVisible();
  expect(
    await count.evaluate((node) => {
      for (let element: Element | null = node; element; element = element.parentElement) {
        if (getComputedStyle(element).opacity === "0") return false;
      }
      return true;
    }),
  ).toBe(true);
  await action.click();
  await expect(page.getByRole("complementary", { name: "Thread", exact: true })).toBeVisible();
});

test("message markdown uses readable compact block spacing in both themes", async ({ page }) => {
  for (const theme of ["light", "dark"]) {
    await page.goto(
      `/iframe.html?id=messaging-components-message-body--markdown&viewMode=story&globals=theme:${theme}`,
    );
    const heading = page.getByRole("heading", { name: "A calmer place to work" });
    await expect(heading).toBeVisible();
    const text = await heading.locator("..").evaluate((node) => {
      const style = getComputedStyle(node);
      return { lineHeight: parseFloat(style.lineHeight), fontSize: parseFloat(style.fontSize) };
    });
    expect(text.lineHeight / text.fontSize).toBeGreaterThanOrEqual(1.45);
    expect(text.lineHeight / text.fontSize).toBeLessThanOrEqual(1.6);
    const cell = page.getByRole("cell").first();
    const padding = await cell.evaluate((node) => parseFloat(getComputedStyle(node).paddingTop));
    expect(padding).toBeGreaterThanOrEqual(5);
    expect(padding).toBeLessThanOrEqual(10);
  }
});

test("a completed send does not clear or focus a different draft destination", async ({ page }) => {
  await openStory(page, "messaging-production-compositions--composer-destinations");
  await page.getByRole("button", { name: "other channel", exact: true }).click();
  await page.getByRole("textbox").fill("Other channel draft");
  await page.getByRole("button", { name: "channel", exact: true }).click();
  await page.getByRole("textbox").fill("Send to the original channel");
  await page.getByRole("textbox").press("Enter");
  await page.getByRole("button", { name: "other channel", exact: true }).click();
  const complete = page.getByRole("button", { name: "Complete send", exact: true });
  await complete.click();
  await expect(page.getByRole("textbox")).toHaveValue("Other channel draft");
  await expect(complete).toBeFocused();
});
