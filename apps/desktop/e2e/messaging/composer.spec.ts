import { test } from "../test-support/fixture.js";
import { disconnectRealtime, waitForRealtimeIdle } from "../test-support/realtime.js";
import { createChannel } from "./test-support.js";
import { expect } from "@playwright/test";

test("composer formatting, emoji and persisted reactions work without rendering unsafe Markdown", async ({
  desktop,
}) => {
  await desktop.provision();
  const { page } = desktop;
  await createChannel(page, "composer-behavior");
  const composer = page.getByRole("textbox", { name: "Message #composer-behavior", exact: true });
  for (const [name, marker] of [
    ["Bold text", "**"],
    ["Italic text", "_"],
    ["Code text", "`"],
  ] as const) {
    await composer.fill("format this");
    await composer.selectText();
    await page.getByRole("button", { name, exact: true }).click();
    await expect(composer).toHaveText(`${marker}format this${marker}`);
  }
  await composer.fill("Composer emoji ");
  await page.getByRole("button", { name: "Add emoji", exact: true }).click();
  await page.getByRole("button", { name: "🚀", exact: true }).click();
  await expect(composer).toHaveText("Composer emoji 🚀");
  await waitForRealtimeIdle(page);
  await disconnectRealtime(page);
  const reads: string[] = [];
  let completedPages = 0;
  let abortedPages = 0;
  page.on("response", (response) => {
    if (response.url().endsWith("/api/v1/context/message-page") && response.ok()) completedPages++;
  });
  page.on("requestfailed", (request) => {
    if (request.url().endsWith("/api/v1/context/message-page")) abortedPages++;
  });
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (
      path.startsWith("/api/v1/") &&
      (request.method() === "GET" || path.endsWith("/message-page"))
    )
      reads.push(path);
  });
  await composer.press("Enter");
  const message = page.getByRole("article").filter({ hasText: "Composer emoji 🚀" });
  await expect(message).toBeVisible();
  await page.waitForLoadState("networkidle");
  expect(reads.filter((path) => !path.endsWith("/message-page")).sort()).toEqual([
    "/api/v1/messaging/conversations",
    "/api/v1/messaging/messages",
  ]);
  await expect.poll(() => completedPages).toBe(1);
  expect(reads.filter((path) => path.endsWith("/message-page"))).toHaveLength(
    completedPages + abortedPages,
  );
  reads.length = 0;
  await message.hover();
  await message.getByRole("button", { name: "React to message", exact: true }).click();
  await page.getByRole("button", { name: "👍", exact: true }).click();
  const reaction = message.getByRole("button", { name: "👍, 1 reactions", exact: true });
  await expect(reaction).toHaveAttribute("aria-pressed", "true");
  await expect(
    message.getByRole("status", { name: "Loading linked work", exact: true }),
  ).toHaveCount(0);
  expect(reads).toEqual(["/api/v1/messaging/messages"]);
  await page.reload();
  await expect(reaction).toHaveAttribute("aria-pressed", "true");
  await reaction.click();
  await expect(reaction).toHaveCount(0);
  await composer.fill(
    '**Safe bold** and _safe italic_ and `safe code`\n\n[Safe link](https://example.com)\n\n[Unsafe link](javascript:alert(1))\n\n<img src=x onerror="window.__messagingXss=true">\n<script>window.__messagingXss=true</script>',
  );
  await composer.press("Enter");
  const markdown = page.getByRole("article").filter({ hasText: "Safe bold" });
  await expect(markdown.locator("strong")).toHaveText("Safe bold");
  await expect(markdown.locator("em")).toHaveText("safe italic");
  await expect(markdown.locator("code")).toHaveText("safe code");
  await expect(markdown.getByRole("link", { name: "Safe link", exact: true })).toHaveAttribute(
    "href",
    "https://example.com",
  );
  await expect(markdown.locator('a[href^="javascript:"]')).toHaveCount(0);
  await expect(markdown.locator("script, img")).toHaveCount(0);
  expect(await page.evaluate("window.__messagingXss")).toBeUndefined();
});
