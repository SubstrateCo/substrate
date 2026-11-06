import { expect, type Page } from "@playwright/test";
import type { Channel } from "storybook/internal/channels";

export async function selectStory(page: Page, id: string) {
  await page.evaluate(
    (storyId) =>
      new Promise<void>((resolve, reject) => {
        // SAFETY: Storybook initializes this channel before its first story finishes.
        const channel = (window as Window & { __STORYBOOK_ADDONS_CHANNEL__?: Channel })
          .__STORYBOOK_ADDONS_CHANNEL__;
        if (!channel) {
          reject(new Error("The Storybook preview channel is not initialized."));
          return;
        }
        const cleanup = () => {
          channel.off("storyFinished", rendered);
          channel.off("storyErrored", failed);
          channel.off("storyThrewException", failed);
        };
        const rendered = (finished: { storyId: string }) => {
          if (finished.storyId !== storyId) return;
          cleanup();
          resolve();
        };
        const failed = () => {
          cleanup();
          reject(new Error(`Story failed to render: ${storyId}`));
        };
        channel.on("storyFinished", rendered);
        channel.on("storyErrored", failed);
        channel.on("storyThrewException", failed);
        channel.emit("setCurrentStory", { storyId, viewMode: "story" });
      }),
    id,
  );
}

export async function openStory(page: Page, id: string) {
  const url = new URL(page.url());
  if (
    url.pathname === "/iframe.html" &&
    !url.searchParams.has("globals") &&
    url.searchParams.get("id") !== id
  ) {
    await selectStory(page, id);
  } else {
    await page.goto(`/iframe.html?id=${id}&viewMode=story`);
    await page.waitForFunction(() => {
      // SAFETY: This Storybook preview exposes its current render; it may still be initializing.
      const preview = (
        window as Window & {
          __STORYBOOK_PREVIEW__?: { currentRender?: { phase: string } };
        }
      ).__STORYBOOK_PREVIEW__;
      return preview?.currentRender?.phase === "finished";
    });
  }
  await expect(page.locator("#storybook-root > div")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}
