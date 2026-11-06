import { expect, test } from "@playwright/test";
import { desktopLink } from "@startup-os/contracts/desktop/links";

test("external email links offer the validated desktop destination without a renderer server", async ({
  page,
}) => {
  const path = "/accept-invitation/test-invitation";
  const url = new URL("/desktop/open", process.env.PLAYWRIGHT_API_URL ?? "http://localhost:3001");
  url.searchParams.set("path", path);
  const response = await page.goto(url.href);
  expect(response?.headers()["referrer-policy"]).toBe("no-referrer");
  await expect(
    page.getByRole("heading", { name: "Continue in Startup OS", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Open Startup OS", exact: true })).toHaveAttribute(
    "href",
    desktopLink(path),
  );
});
