import { captureMotion, captureScreenshot } from "./test-support/capture";
import { test } from "./test-support/fixtures";
import { signIn } from "./test-support/navigation";
import { expect, type Page } from "@playwright/test";

async function swipe(page: Page, from: number, to: number, y: number) {
  const input = await page.context().newCDPSession(page);
  try {
    await input.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: from, y }],
    });
    for (let step = 1; step <= 12; step++) {
      await input.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: from + ((to - from) * step) / 12, y }],
      });
      await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => done())));
    }
    await input.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } finally {
    await input.detach();
  }
}

test("Expo web preview: touch drawer gestures and nested dialog motion retain the conversation", async ({
  page,
  workspace,
}, info) => {
  await signIn(page, info, workspace);
  await page.goto(`/?${new URLSearchParams({ conversationId: workspace.conversationId })}`);
  const source = page.getByTestId(`message-${workspace.messageId}`);
  await expect(source).toBeVisible();
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("The gesture preview needs a fixed viewport.");
  const y = viewport.height / 3;
  const drawer = page.getByTestId("conversation-drawer");
  await captureMotion(page, info, "drawer-touch-open", async () => {
    await swipe(page, 4, viewport.width / 2, y);
    await expect(drawer).toBeVisible();
  });
  const panel = await drawer.boundingBox();
  if (!panel) throw new Error("The conversation drawer did not open.");
  expect(panel.width / viewport.width).toBeGreaterThanOrEqual(0.8);
  expect(panel.width / viewport.width).toBeLessThanOrEqual(0.85);
  await captureScreenshot(page, info, "drawer-touch-open");

  await page.getByTestId("new-message").click();
  await captureMotion(page, info, "new-channel-dialog-open", async () => {
    await page.getByRole("button", { name: "New channel", exact: true }).click();
    await expect(page.getByRole("heading", { name: "New channel", exact: true })).toBeVisible();
  });
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(drawer).toBeVisible();
  await captureMotion(page, info, "drawer-touch-close", async () => {
    await swipe(page, panel.width - 24, 24, y);
    await expect(drawer).toHaveCount(0);
  });
  await expect(source).toBeVisible();
  await expect(page).toHaveURL(new RegExp(workspace.conversationId));
});
