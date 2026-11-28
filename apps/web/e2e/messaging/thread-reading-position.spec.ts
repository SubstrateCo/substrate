import { conversation, post, test, visit, type Actor, type Client } from "../test-support/fixtures";
import { expect, type Locator, type Page } from "@playwright/test";

const detail =
  "A detailed update with enough text to wrap differently when the thread pane opens. ".repeat(5);

async function seedHistory(actor: Actor, conversationId: string, threadId?: string) {
  for (let index = 0; index < 36; index++) {
    const root = await post<{ id: string }>(actor, "messaging/messages", {
      conversationId,
      threadId,
      body: `Reading position ${index}: ${detail}`,
    });
    if (!threadId && (index === 14 || index === 15))
      await post(actor, "messaging/messages", {
        conversationId,
        threadId: root.id,
        body: `Side discussion ${index}`,
      });
  }
}

async function settle(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

async function offset(row: Locator) {
  return row.evaluate(
    (node) =>
      node.getBoundingClientRect().top - node.closest('[role="log"]')!.getBoundingClientRect().top,
  );
}

async function readFrom(page: Page, row: Locator) {
  await row.evaluate((node) => {
    const log = node.closest('[role="log"]')!;
    log.scrollTop += node.getBoundingClientRect().top - log.getBoundingClientRect().top - 12;
  });
  await settle(page);
  await expect(row).toBeInViewport();
  return offset(row);
}

async function expectPosition(page: Page, row: Locator, top: number) {
  await settle(page);
  expect(
    Math.abs((await offset(row)) - top),
    "visible message drift in CSS pixels",
  ).toBeLessThanOrEqual(2);
}

async function resizeThread(page: Page, delta: number) {
  const handle = page.getByRole("separator", { name: "Resize thread", exact: true });
  const bounds = (await handle.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + delta, bounds.y + bounds.height / 2, { steps: 10 });
  await page.mouse.up();
}

async function sendImage(viewer: Client, inThread = false) {
  const encoded = await viewer.page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 800;
    canvas.height = 1200;
    canvas.getContext("2d")!.fillRect(0, 0, 800, 1200);
    return canvas.toDataURL("image/png").split(",")[1]!;
  });
  const scope = inThread
    ? viewer.page.getByRole("complementary", { name: "Thread", exact: true })
    : viewer.page;
  const zone = scope.getByRole("region", { name: "Message attachments", exact: true });
  await zone.getByLabel("Choose attachment files").setInputFiles({
    name: "reading-position.png",
    mimeType: "image/png",
    buffer: Buffer.from(encoded, "base64"),
  });
  await expect(zone.getByText("Ready to attach", { exact: true })).toBeVisible();
  await zone.getByRole("textbox").fill("An image above the reading position");
  await zone.getByRole("button", { name: "Send", exact: true }).click();
  await expect(scope.getByRole("img", { name: "reading-position.png", exact: true })).toBeVisible();
}

for (const images of [false, true]) {
  test(`older reading position survives thread opening, switching, resizing and closing${images ? " with images" : ""}`, async ({
    actors,
    client,
  }) => {
    test.setTimeout(60_000);
    const channel = await conversation(actors.sender);
    const viewer = await client(actors.sender);
    const { page } = viewer;
    if (images) {
      await visit(viewer, channel.id);
      await sendImage(viewer);
    }
    await seedHistory(actors.sender, channel.id);
    await visit(viewer, channel.id);
    const log = page.getByRole("log", { name: "Messages", exact: true }).first();
    const image = log.getByRole("img", { name: "reading-position.png", exact: true });
    if (images)
      await expect
        .poll(() => image.evaluate((node: HTMLImageElement) => node.naturalHeight))
        .toBe(1200);
    const imageHeight = images ? (await image.boundingBox())!.height : 0;
    const row = log.getByRole("article").filter({ hasText: /^Reading position 14:/ });
    const top = await readFrom(page, row);
    const originalWidth = (await log.boundingBox())!.width;
    await row.getByRole("button", { name: /^1 reply/ }).click();
    const thread = page.getByRole("complementary", { name: "Thread", exact: true });
    await expect(thread.getByText("Side discussion 14", { exact: true })).toBeVisible();
    expect((await log.boundingBox())!.width).toBeLessThan(originalWidth - 100);
    await expectPosition(page, row, top);

    const second = log.getByRole("article").filter({ hasText: /^Reading position 15:/ });
    const paneWidth = (await thread.boundingBox())!.width;
    await second.getByRole("button", { name: /^1 reply/ }).click();
    await expect(thread.getByText("Side discussion 15", { exact: true })).toBeVisible();
    expect((await thread.boundingBox())!.width).toBe(paneWidth);
    await expectPosition(page, row, top);

    await resizeThread(page, -220);
    expect((await thread.boundingBox())!.width).toBeGreaterThan(paneWidth + 50);
    await expectPosition(page, row, top);

    await page.setViewportSize({ width: 1100, height: 800 });
    if (images)
      await expect
        .poll(async () => (await image.boundingBox())!.height)
        .toBeLessThan(imageHeight - 20);
    await expectPosition(page, row, top);
    const smallerImageHeight = images ? (await image.boundingBox())!.height : 0;
    await thread.getByRole("button", { name: "Close thread", exact: true }).click();
    await expect(thread).toHaveCount(0);
    if (images)
      await expect
        .poll(async () => (await image.boundingBox())!.height)
        .toBeGreaterThan(smallerImageHeight + 20);
    await expectPosition(page, row, top);
    await expect(page.getByRole("button", { name: "New messages", exact: true })).toHaveCount(0);
  });
}

test("latest messages stay bottom-aligned when a thread opens and closes", async ({
  actors,
  client,
}) => {
  test.setTimeout(60_000);
  const channel = await conversation(actors.sender);
  await seedHistory(actors.sender, channel.id);
  const viewer = await client(actors.sender);
  const { page } = viewer;
  await visit(viewer, channel.id);
  const log = page.getByRole("log", { name: "Messages", exact: true }).first();
  const gap = () => log.evaluate((node) => node.scrollHeight - node.scrollTop - node.clientHeight);
  await expect.poll(gap).toBeLessThan(2);
  const latest = log.getByRole("article").last();
  await latest.hover();
  await latest.getByRole("button", { name: "Reply in thread", exact: true }).click();
  const thread = page.getByRole("complementary", { name: "Thread", exact: true });
  await expect(thread).toBeVisible();
  await expect.poll(gap).toBeLessThan(2);
  await thread.getByRole("button", { name: "Close thread", exact: true }).click();
  await expect(thread).toHaveCount(0);
  await expect.poll(gap).toBeLessThan(2);
});

for (const location of ["channel", "thread"] as const) {
  test(`late image loading above an older reader preserves the ${location} reading position`, async ({
    actors,
    client,
  }) => {
    test.setTimeout(60_000);
    const channel = await conversation(actors.sender);
    const root =
      location === "thread"
        ? await post<{ id: string }>(actors.sender, "messaging/messages", {
            conversationId: channel.id,
            body: "Image reading discussion",
          })
        : undefined;
    const sender = await client(actors.sender);
    await visit(sender, channel.id);
    if (root) {
      const row = sender.page.getByRole("article").filter({ hasText: "Image reading discussion" });
      await row.hover();
      await row.getByRole("button", { name: "Reply in thread", exact: true }).click();
    }
    await sendImage(sender, !!root);
    await seedHistory(actors.sender, channel.id, root?.id);
    const viewer = await client(actors.sender);
    const { page } = viewer;
    let requested = false;
    const release = Promise.withResolvers<void>();
    await page.route("**/api/v1/files/attachments/messages/preview?*", async (route) => {
      requested = true;
      await release.promise;
      await route.continue();
    });
    try {
      await visit(viewer, channel.id);
      if (location === "thread")
        await page
          .getByRole("article")
          .filter({ hasText: "Image reading discussion" })
          .getByRole("button", { name: /^37 replies/ })
          .click();
      const scope =
        location === "thread"
          ? page.getByRole("complementary", { name: "Thread", exact: true })
          : page;
      const image = scope.getByRole("img", { name: "reading-position.png", exact: true });
      // Thread history can put this outside Chromium's lazy-load range. Start the real request
      // before returning to the older message, with its response still blocked.
      await image.scrollIntoViewIfNeeded();
      await expect.poll(() => requested, "the image preview request starts").toBe(true);
      const row = scope
        .getByRole("log", { name: "Messages", exact: true })
        .getByRole("article")
        .filter({ hasText: /^Reading position 14:/ });
      const top = await readFrom(page, row);
      const loadingHeight = (await image.boundingBox())!.height;
      release.resolve();
      await expect
        .poll(() => image.evaluate((node: HTMLImageElement) => node.naturalWidth))
        .toBe(800);
      await expect
        .poll(async () => (await image.boundingBox())!.height)
        .toBeGreaterThan(loadingHeight + 20);
      await expectPosition(page, row, top);
      if (location === "thread") {
        const loadedHeight = (await image.boundingBox())!.height;
        await resizeThread(page, 160);
        await expect
          .poll(async () => (await image.boundingBox())!.height)
          .toBeLessThan(loadedHeight - 20);
        await expectPosition(page, row, top);
        const next = scope
          .getByRole("log", { name: "Messages", exact: true })
          .getByRole("article")
          .filter({ hasText: /^Reading position 24:/ });
        const nextTop = await readFrom(page, next);
        await resizeThread(page, -160);
        await expectPosition(page, next, nextTop);
        const previous = scope
          .getByRole("log", { name: "Messages", exact: true })
          .getByRole("article")
          .filter({ hasText: /^Reading position 23:/ });
        const previousTop = await readFrom(page, previous);
        await resizeThread(page, 160);
        await expectPosition(page, previous, previousTop);
      }
    } finally {
      release.resolve();
    }
  });
}

test("thread reading-position resize and scroll workload @benchmark", async ({
  actors,
  client,
}) => {
  test.setTimeout(60_000);
  const channel = await conversation(actors.sender);
  const viewer = await client(actors.sender);
  const { page } = viewer;
  await visit(viewer, channel.id);
  await sendImage(viewer);
  await seedHistory(actors.sender, channel.id);
  await visit(viewer, channel.id);
  const log = page.getByRole("log", { name: "Messages", exact: true }).first();
  const row = log.getByRole("article").filter({ hasText: /^Reading position 14:/ });
  await readFrom(page, row);
  await row.getByRole("button", { name: /^1 reply/ }).click();
  await expect(page.getByText("Side discussion 14", { exact: true })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const session = await page.context().newCDPSession(page);
  await session.send("Performance.enable");
  const metrics = async () => {
    const result: { metrics: { name: string; value: number }[] } =
      await session.send("Performance.getMetrics");
    return Object.fromEntries(result.metrics.map(({ name, value }) => [name, value]));
  };
  const resize = async () => {
    await page.setViewportSize({ width: 1100, height: 900 });
    await settle(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await settle(page);
  };
  const results = [];
  await resize();
  for (let trial = 0; trial < 3; trial++) {
    const beforeResize = await metrics();
    for (let index = 0; index < 6; index++) await resize();
    const afterResize = await metrics();
    await log.evaluate(async (node) => {
      for (let index = 0; index < 40; index++) {
        node.scrollTop = 200 + (index % 12) * 120;
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }
    });
    await settle(page);
    const afterScroll = await metrics();
    results.push({
      resizeTaskMs: (afterResize.TaskDuration! - beforeResize.TaskDuration!) * 1000,
      resizeLayoutMs: (afterResize.LayoutDuration! - beforeResize.LayoutDuration!) * 1000,
      resizeLayouts: afterResize.LayoutCount! - beforeResize.LayoutCount!,
      scrollTaskMs: (afterScroll.TaskDuration! - afterResize.TaskDuration!) * 1000,
      scrollLayoutMs: (afterScroll.LayoutDuration! - afterResize.LayoutDuration!) * 1000,
      scrollLayouts: afterScroll.LayoutCount! - afterResize.LayoutCount!,
    });
  }
  await session.detach();
  await test.info().attach("reading-position-performance", {
    body: JSON.stringify(results, null, 2),
    contentType: "application/json",
  });
  console.log("Reading-position performance:", JSON.stringify(results));
  for (const result of results) expect(result.scrollLayouts).toBeLessThanOrEqual(2);
});
