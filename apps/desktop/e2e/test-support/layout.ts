import type { DesktopFixture } from "./fixture.js";
import { expect, type Locator } from "@playwright/test";

export async function resize(desktop: DesktopFixture, width: number, height: number) {
  await desktop.app.evaluate(
    ({ BrowserWindow }, size) => {
      BrowserWindow.getAllWindows()[0]!.setContentSize(size.width, size.height);
    },
    { width, height },
  );
  await expect
    .poll(() => desktop.page.evaluate(() => ({ width: innerWidth, height: innerHeight })))
    .toEqual({ width, height });
}

export async function fitsWindow(locator: Locator) {
  await expect(locator).toBeVisible();
  await locator.scrollIntoViewIfNeeded();
  await expect(locator).toBeInViewport();
  await expect
    .poll(
      () =>
        locator.evaluate((element) => {
          const box = element.getBoundingClientRect();
          if (
            box.left < -1 ||
            box.top < -1 ||
            box.right > innerWidth + 1 ||
            box.bottom > innerHeight + 1
          )
            return false;
          for (let parent = element.parentElement; parent; parent = parent.parentElement) {
            const style = getComputedStyle(parent);
            if (style.display === "contents") continue;
            const bounds = parent.getBoundingClientRect();
            const left = bounds.left + parent.clientLeft;
            const top = bounds.top + parent.clientTop;
            if (
              /auto|scroll|hidden|clip/.test(style.overflowX) &&
              (box.left < left - 1 || box.right > left + parent.clientWidth + 1)
            )
              return false;
            if (
              /auto|scroll|hidden|clip/.test(style.overflowY) &&
              (box.top < top - 1 || box.bottom > top + parent.clientHeight + 1)
            )
              return false;
          }
          return document.documentElement.scrollWidth <= innerWidth + 1;
        }),
      "The control fits the window and its clipping ancestors",
    )
    .toBe(true);
}
