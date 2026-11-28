import { conversation, post, test, visit } from "../test-support/fixtures";
import { captureScreenshot } from "../test-support/screenshots";
import { expect, type Locator } from "@playwright/test";

async function expectBottom(log: Locator, last: Locator) {
  await expect
    .poll(() => log.evaluate((node) => node.scrollHeight - node.scrollTop - node.clientHeight))
    .toBeLessThan(2);
  await expect
    .poll(() =>
      last.evaluate((node) => {
        const viewport = node.closest('[role="log"]')!.getBoundingClientRect();
        return node.getBoundingClientRect().bottom <= viewport.bottom;
      }),
    )
    .toBe(true);
}

for (const location of ["channel", "thread"] as const) {
  test(`${location} follows new messages, large last-message edits, and loaded images without moving older readers`, async ({
    actors,
    client,
  }) => {
    test.setTimeout(60_000);
    const channel = await conversation(actors.sender, [actors.member.email]);
    const root = await post<{ id: string }>(actors.sender, "messaging/messages", {
      conversationId: channel.id,
      body: "Bottom-follow discussion",
    });
    const target = {
      conversationId: channel.id,
      ...(location === "thread" && { threadId: root.id }),
    };
    for (let index = 0; index < 35; index++)
      await post(actors.sender, "messaging/messages", {
        ...target,
        body: `Earlier update ${index}`,
      });
    const viewer = await client(actors.sender);
    await visit(viewer, channel.id);
    const { page } = viewer;
    if (location === "thread")
      await page
        .getByRole("article")
        .filter({ hasText: "Bottom-follow discussion" })
        .getByRole("button", { name: "35 replies", exact: true })
        .click();
    const pane =
      location === "thread"
        ? page.getByRole("complementary", { name: "Thread", exact: true })
        : page;
    const log = pane.getByRole("log", { name: "Messages", exact: true });
    await expectBottom(log, log.getByRole("article").last());
    const latest = await post<{ id: string }>(actors.member, "messaging/messages", {
      ...target,
      body: "New live update",
    });
    const latestRow = log.getByRole("article").filter({ hasText: "New live update" });
    await expect(latestRow).toBeVisible();
    await expectBottom(log, latestRow);

    const expand = async (label: string, count = 10) => {
      const response = await actors.member.request.post("/api/v1/messaging/messages/edit", {
        data: {
          organizationId: actors.member.organizationId,
          messageId: latest.id,
          body: `New live update\n\n${Array.from({ length: count }, (_, index) => `${label} ${index}`).join("\n\n")}`,
        },
      });
      expect(response.ok()).toBe(true);
      await expect(latestRow.getByText(`${label} ${count - 1}`, { exact: true })).toBeVisible();
    };
    await expand("Expanded detail");
    await expectBottom(log, latestRow);
    await log.evaluate((node) => {
      node.scrollTop = 120;
    });
    const jump = pane.getByRole("button", { name: "Scroll to latest", exact: true });
    await expect(jump).toBeVisible();
    const readingPosition = await log.evaluate((node) => node.scrollTop);
    await expand("Revised detail", 18);
    await post(actors.member, "messaging/messages", {
      ...target,
      body: "Another update while reading history",
    });
    const newMessages = pane.getByRole("button", { name: "New messages", exact: true });
    await expect(newMessages).toBeVisible();
    expect(await log.evaluate((node) => node.scrollTop)).toBe(readingPosition);
    await expect(log.getByText("Another update while reading history")).not.toBeInViewport();
    await newMessages.click();
    await expectBottom(log, log.getByRole("article").last());

    const imageReady = Promise.withResolvers<void>();
    const releaseImage = Promise.withResolvers<void>();
    const previewUrl = "**/api/v1/files/attachments/messages/preview?*";
    await page.route(previewUrl, async (route) => {
      imageReady.resolve();
      await releaseImage.promise;
      await route.continue();
    });
    try {
      const encoded = await page.evaluate(() => {
        const canvas = document.createElement("canvas");
        canvas.width = 200;
        canvas.height = 800;
        const context = canvas.getContext("2d")!;
        context.fillStyle = "#3056a0";
        context.fillRect(0, 0, canvas.width, canvas.height);
        return canvas.toDataURL("image/png").split(",")[1]!;
      });
      const zone = pane.getByRole("region", { name: "Message attachments", exact: true });
      await zone.getByLabel("Choose attachment files").setInputFiles({
        name: "bottom-follow.png",
        mimeType: "image/png",
        buffer: Buffer.from(encoded, "base64"),
      });
      await expect(zone.getByText("Ready to attach", { exact: true })).toBeVisible();
      await zone.getByRole("textbox").fill("A sent image that loads later");
      await zone.getByRole("button", { name: "Send", exact: true }).click();
      await imageReady.promise;
      const image = log.getByRole("img", { name: "bottom-follow.png", exact: true });
      await expectBottom(log, log.getByRole("article").last());
      const loadingHeight = await image.evaluate((node) => node.getBoundingClientRect().height);
      releaseImage.resolve();
      await expect
        .poll(() => image.evaluate((node: HTMLImageElement) => node.naturalHeight))
        .toBe(800);
      await expect
        .poll(() => image.evaluate((node) => node.getBoundingClientRect().height))
        .toBeGreaterThan(loadingHeight + 100);
      await expectBottom(log, log.getByRole("article").last());
      const viewport = page.viewportSize()!;
      await page.setViewportSize({ ...viewport, height: viewport.height - 140 });
      await expectBottom(log, log.getByRole("article").last());
      await page.setViewportSize(viewport);
      await expectBottom(log, log.getByRole("article").last());
      await captureScreenshot(page, `messaging-${location}-bottom-follow-image`);
    } finally {
      releaseImage.resolve();
      await page.unroute(previewUrl);
    }
  });
}
