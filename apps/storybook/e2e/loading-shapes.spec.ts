import { expect, test, type Locator } from "@playwright/test";
import { writeFile } from "node:fs/promises";

async function bounds(locator: Locator) {
  const value = await locator.boundingBox();
  expect(value).not.toBeNull();
  return value!;
}

for (const theme of ["light", "dark"]) {
  test(`project loading fills the pane and aligns with ready content in ${theme}`, async ({
    page,
  }, testInfo) => {
    await page.goto(
      `/iframe.html?id=workspace-loading-shapes--project&viewMode=story&globals=theme:${theme}`,
    );
    const loading = page.getByRole("status", {
      name: "Loading project",
      exact: true,
    });
    await expect(loading).toBeVisible();
    const pane = await bounds(
      page.getByRole("region", { name: "Project fixture" }),
    );
    const before = await bounds(loading);
    const title = await bounds(
      loading.locator('[data-slot="skeleton"]').first(),
    );
    expect(before.width).toBeGreaterThanOrEqual(pane.width - 2);
    expect(title.x).toBe(pane.x + 24);
    expect(title.y).toBe(pane.y + 24);
    await expect(loading.locator('[data-slot="skeleton"]').first()).toHaveCSS(
      "animation-name",
      "none",
    );
    await page.screenshot({
      path: testInfo.outputPath(`project-loading-${theme}.png`),
    });
    await page.getByRole("button", { name: "Resolve loading" }).click();
    const readyTitle = await bounds(
      page.getByRole("heading", { name: "Product launch" }),
    );
    expect(Math.abs(title.x - readyTitle.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(title.y - readyTitle.y)).toBeLessThanOrEqual(1);
    await page.screenshot({
      path: testInfo.outputPath(`project-ready-${theme}.png`),
    });
  });

  for (const hasSourceText of [true, false]) {
    test(`source task fields keep geometry with source copy ${hasSourceText} in ${theme}`, async ({
      page,
    }, testInfo) => {
      const story = hasSourceText
        ? "source-fields"
        : "fields-without-source-copy";
      await page.goto(
        `/iframe.html?id=workspace-loading-shapes--${story}&viewMode=story&globals=theme:${theme}`,
      );
      await page.getByRole("combobox", { name: "Destination project" }).click();
      await page.getByRole("option", { name: "Product launch" }).click();
      const loading = page.getByRole("status", {
        name: "Loading task fields",
        exact: true,
      });
      await expect(loading).toBeVisible();
      const section = page.getByRole("region", {
        name: "Create task from message",
      });
      const quote = section.locator("blockquote");
      const destination = page.getByRole("combobox", {
        name: "Destination project",
      });
      const before = {
        fields: await bounds(loading),
        section: await bounds(section),
        source: await bounds(quote),
        destination: await bounds(destination),
      };
      await page.screenshot({
        path: testInfo.outputPath(
          `fields-loading-${hasSourceText}-${theme}.png`,
        ),
      });
      await page.getByRole("button", { name: "Resolve loading" }).click();
      const form = page.getByRole("form", { name: "New task", exact: true });
      await expect(form).toBeVisible();
      const after = {
        fields: await bounds(form),
        section: await bounds(section),
        source: await bounds(quote),
        destination: await bounds(destination.first()),
      };
      expect(
        Math.abs(before.fields.height - after.fields.height),
      ).toBeLessThanOrEqual(1);
      expect(
        Math.abs(before.section.height - after.section.height),
      ).toBeLessThanOrEqual(1);
      expect(before.source).toEqual(after.source);
      expect(before.destination).toEqual(after.destination);
      await expect(
        page.getByRole("button", { name: "Copy source text into description" }),
      ).toHaveCount(hasSourceText ? 1 : 0);
      await page.screenshot({
        path: testInfo.outputPath(`fields-ready-${hasSourceText}-${theme}.png`),
      });
      const geometry = testInfo.outputPath("geometry.json");
      await writeFile(geometry, JSON.stringify({ before, after }, null, 2));
      await testInfo.attach("geometry", {
        path: geometry,
        contentType: "application/json",
      });
    });
  }

  test(`inline reference has progress distinct from unavailable in ${theme} with reduced motion`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(
      `/iframe.html?id=workspace-loading-shapes--inline-reference&viewMode=story&globals=theme:${theme}`,
    );
    const status = page.getByRole("status", {
      name: "Loading reference…",
      exact: true,
    });
    await expect(status).toBeVisible();
    const spinner = status.locator('[data-slot="spinner"]');
    await expect(spinner).toBeVisible();
    await expect(spinner).toHaveCSS("animation-name", "none");
    await expect(status.locator(".lucide-lock-keyhole")).toHaveCount(0);
    const unavailable = page
      .getByText("Unavailable reference", { exact: true })
      .locator("..");
    await expect(unavailable.locator(".lucide-lock-keyhole")).toBeVisible();
    await expect(unavailable.locator('[data-slot="spinner"]')).toHaveCount(0);
    const loadingIcon = await bounds(spinner);
    const unavailableIcon = await bounds(unavailable.locator("svg"));
    expect(loadingIcon.width).toBe(unavailableIcon.width);
    expect(loadingIcon.height).toBe(unavailableIcon.height);
    await page.screenshot({
      path: testInfo.outputPath(`reference-${theme}.png`),
    });
  });
}
