import { expect, test, type Page } from "@playwright/test";

async function expectDocumentFixed(page: Page) {
  const size = await page.evaluate(() => {
    window.scrollTo(1000, 1000);
    return {
      contentHeight: document.documentElement.scrollHeight,
      height: innerHeight,
      contentWidth: document.documentElement.scrollWidth,
      width: innerWidth,
      x: scrollX,
      y: scrollY,
    };
  });
  expect(size.contentHeight).toBe(size.height);
  expect(size.contentWidth).toBe(size.width);
  expect(size.x).toBe(0);
  expect(size.y).toBe(0);
  expect((await page.getByRole("main").boundingBox())!.y).toBe(0);
}

for (const viewport of [
  { width: 1440, height: 500 },
  { width: 1024, height: 768 },
  { width: 390, height: 640 },
  { width: 800, height: 420 },
]) {
  test(`task states keep the desktop frame internal at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    let frame: { x: number; y: number; width: number; height: number } | null = null;
    let sidebar: { x: number; y: number; width: number; height: number } | null = null;
    for (const state of ["loading-project", "project-error", "empty-project", "project"]) {
      await page.goto(`/iframe.html?id=projects-scenes-tasks--${state}&viewMode=story`);
      const workspace = page.getByRole("region", { name: "Tasks application", exact: true });
      await expect(workspace).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const bounds = await workspace.boundingBox();
      const side = await page
        .getByRole("complementary", { name: "Projects", exact: true })
        .boundingBox();
      if (frame) expect(bounds).toEqual(frame);
      if (sidebar) expect(side).toEqual(sidebar);
      frame = bounds;
      sidebar = side;
      expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(
        true,
      );
      if (state === "project-error") {
        await page.getByRole("button", { name: "Try again", exact: true }).click();
        await expect(page.getByRole("button", { name: /Ship the launch/ })).toBeVisible();
        expect(await workspace.boundingBox()).toEqual(frame);
      }
    }
    const projectHeader = page.getByRole("heading", { name: "Product launch", exact: true });
    const header = await projectHeader.boundingBox();
    await page.getByRole("button", { name: /Ship the launch/ }).click();
    expect(await projectHeader.boundingBox()).toEqual(header);
    await page.getByRole("button", { name: "New task", exact: true }).click();
    expect(await projectHeader.boundingBox()).toEqual(header);
    await page.getByRole("tab", { name: "Project settings", exact: true }).click();
    expect(await projectHeader.boundingBox()).toEqual(header);
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(
      true,
    );
    await page.goto("/iframe.html?id=projects-scenes-tasks--draft-access-loss&viewMode=story");
    await expect(projectHeader).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const refreshHeader = await projectHeader.boundingBox();
    await page.getByRole("button", { name: "Fail refresh", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Couldn’t refresh project", exact: true }),
    ).toBeVisible();
    expect(await projectHeader.boundingBox()).toEqual(refreshHeader);
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    expect(await projectHeader.boundingBox()).toEqual(refreshHeader);
  });
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1440, height: 500 },
  { width: 1024, height: 768 },
  { width: 800, height: 420 },
  { width: 390, height: 700 },
]) {
  test(`long task list and inspector scroll without moving the header at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/iframe.html?id=projects-scenes-tasks--large-project&viewMode=story");
    const list = page.getByRole("region", { name: "Project tasks", exact: true });
    await expect(list.getByRole("button")).toHaveCount(160);
    await page.evaluate(() => document.fonts.ready);
    const header = page.getByRole("heading", { name: "Product launch", exact: true });
    const position = await header.boundingBox();
    const taskPane =
      viewport.width >= 768 ? list : page.getByRole("tabpanel", { name: "Tasks", exact: true });
    const scroll = await taskPane.evaluate((element) => ({
      content: element.scrollHeight,
      available: element.clientHeight,
    }));
    expect(scroll.content).toBeGreaterThan(scroll.available);
    await expectDocumentFixed(page);
    await taskPane.hover();
    await page.mouse.wheel(0, 400);
    await expect.poll(() => taskPane.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    expect(await header.boundingBox()).toEqual(position);
    await expectDocumentFixed(page);
    await list.getByRole("button").last().click();
    await expect(header).toBeInViewport();
    expect(await header.boundingBox()).toEqual(position);
    await page.getByLabel("Add a comment", { exact: true }).fill("Long comment. ".repeat(700));
    await page.getByRole("button", { name: "Post comment", exact: true }).click();
    const inspector =
      viewport.width >= 768
        ? page.getByLabel("Selected task panel", { exact: true })
        : page.getByRole("tabpanel", { name: "Tasks", exact: true });
    const detailScroll = await inspector.evaluate((element) => ({
      content: element.scrollHeight,
      available: element.clientHeight,
    }));
    expect(detailScroll.content).toBeGreaterThan(detailScroll.available);
    await page.getByRole("button", { name: "Post comment", exact: true }).scrollIntoViewIfNeeded();
    await expect(page.getByRole("button", { name: "Post comment", exact: true })).toBeInViewport();
    expect(await header.boundingBox()).toEqual(position);
    await expectDocumentFixed(page);
    await page.getByRole("button", { name: "New task", exact: true }).click();
    expect(await header.boundingBox()).toEqual(position);
    await expect(page.getByLabel("Task title", { exact: true })).toBeFocused();
    await page.getByLabel("Task title", { exact: true }).fill("Short frame task");
    const create = page.getByRole("button", { name: "Create task", exact: true });
    await create.scrollIntoViewIfNeeded();
    await expect(create).toBeInViewport();
    const formPane =
      viewport.width >= 768
        ? page.getByLabel("Task form panel", { exact: true })
        : page.getByRole("tabpanel", { name: "Tasks", exact: true });
    if (viewport.height <= 500 || viewport.width < 768)
      expect(await formPane.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    expect(await header.boundingBox()).toEqual(position);
    await expectDocumentFixed(page);
  });
}
