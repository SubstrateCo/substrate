import { isolateContext } from "./fixtures";
import type { Page } from "@playwright/test";

export async function pauseClock(page: Page) {
  // The fake clock applies to the whole browser context, so later tests must not reuse it.
  isolateContext(page);
  const time = new Date("2026-11-07T12:00:00Z");
  await page.clock.install({ time });
  await page.clock.pauseAt(new Date(time.getTime() + 1000));
}

export function searches(page: Page) {
  const requests: { query: string; organizationId: string }[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/v1/context/search")
      requests.push(request.postDataJSON());
  });
  return requests;
}
