import {} from "./fixtures";
import { expect, type Locator, type Page } from "@playwright/test";

export async function pauseClock(page: Page) {
  const time = new Date("2026-11-07T12:00:00Z");
  await page.clock.install({ time });
  await page.clock.pauseAt(new Date(time.getTime() + 1000));
}

export async function visibleWithClock(page: Page, locator: Locator) {
  await expect
    .poll(async () => {
      await page.clock.runFor(50);
      return locator.isVisible();
    })
    .toBe(true);
}

export function searches(page: Page) {
  const requests: { query: string; organizationId: string }[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/v1/context/search")
      requests.push(request.postDataJSON());
  });
  return requests;
}
