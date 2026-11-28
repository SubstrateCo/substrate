import { captureMotion, captureScreenshot } from "./test-support/capture";
import { test } from "./test-support/fixtures";
import { openMessageActions, sourceBody } from "./test-support/messages";
import { signIn } from "./test-support/navigation";
import { expect, type Locator } from "@playwright/test";

async function bounds(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("The notification is not visible.");
  return box;
}

test("Expo web preview: real Copy feedback stays centered and expands upward on hover or touch", async ({
  page,
  context,
  workspace,
}, info) => {
  await signIn(page, info, workspace);
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: new URL(page.url()).origin,
  });
  await page.goto(`/?${new URLSearchParams({ conversationId: workspace.conversationId })}`);
  await expect(page.getByTestId(`message-${workspace.messageId}`)).toBeVisible();

  const messages = [{ id: workspace.messageId, body: sourceBody }];
  for (const body of [
    "I checked the launch scope with the team.",
    "The next review is ready for the design partner.",
  ]) {
    await page.getByRole("textbox").fill(body);
    await page.getByTestId("send-message").click();
    const row = page.getByTestId(/^message-/).filter({
      has: page.getByText(body, { exact: true }),
    });
    await expect(row).toBeVisible();
    const testId = await row.getAttribute("data-testid");
    if (!testId) throw new Error("The sent message has no record identifier.");
    messages.push({ id: testId.slice("message-".length), body });
  }

  for (const [index, message] of messages.entries()) {
    await openMessageActions(page, message.id, message.body);
    await page.getByRole("button", { name: "Copy text", exact: true }).click();
    await expect(page.locator("[data-sonner-toast]")).toHaveCount(index + 1);
  }
  await page.mouse.move(0, 0);
  const toasts = page.locator("[data-sonner-toast]");
  const front = page.locator('[data-sonner-toast][data-front="true"]');
  const oldest = toasts.last();
  await expect(front).toHaveText("Copied");
  await expect(front).toHaveAttribute("data-expanded", "false");
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("The mobile preview needs a fixed viewport.");
  const frontBox = await bounds(front);
  expect(Math.abs(frontBox.x + frontBox.width / 2 - viewport.width / 2)).toBeLessThanOrEqual(2);
  await expect
    .poll(async () => (await bounds(front)).y - (await bounds(oldest)).y)
    .toBeLessThan(frontBox.height);
  await captureScreenshot(page, info, "toasts-copy-collapsed");

  await captureMotion(page, info, "toasts-expand-upward", async () => {
    await front.hover();
    await expect(front).toHaveAttribute("data-expanded", "true");
    await expect
      .poll(async () => {
        const rear = await bounds(oldest);
        return (await bounds(front)).y - rear.y - rear.height;
      })
      .toBeGreaterThan(0);
    const dismiss = front.getByRole("button", { name: "Dismiss notification", exact: true });
    const dismissBox = await bounds(dismiss);
    expect(dismissBox.width).toBeGreaterThanOrEqual(48);
    expect(dismissBox.height).toBeGreaterThanOrEqual(48);
    await captureScreenshot(page, info, "toasts-copy-expanded");
  });

  await page.mouse.move(0, 0);
  await expect(front).toHaveAttribute("data-expanded", "false");
  const touchBox = await bounds(front);
  const input = await context.newCDPSession(page);
  try {
    await input.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: touchBox.x + 32, y: touchBox.y + touchBox.height / 2 }],
    });
    await expect(front).toHaveAttribute("data-expanded", "true");
    await captureScreenshot(page, info, "toasts-copy-touch-expanded");
    await input.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect(front).toHaveAttribute("data-expanded", "false");
  } finally {
    await input.detach();
  }

  await front.getByRole("button", { name: "Dismiss notification", exact: true }).click();
  await expect(toasts).toHaveCount(2);
});
