import { themes } from "@substrate/design-tokens";

import { captureScreenshot } from "./capture";
import type { ReviewWorkspace } from "./fixtures";
import { expect, type Page, type TestInfo } from "@playwright/test";

export async function signIn(page: Page, info: TestInfo, workspace: ReviewWorkspace) {
  await page.goto("/");
  await page.getByLabel("Email", { exact: true }).fill(workspace.email);
  await page.getByLabel("Password", { exact: true }).fill(workspace.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  const openWorkspace = page.getByRole("button", {
    name: `Open ${workspace.name}'s test workspace`,
    exact: true,
  });
  await expect(page.getByTestId("app-shell").or(openWorkspace)).toBeVisible();
  if (await openWorkspace.isVisible()) {
    await captureScreenshot(page, info, "workspace-picker");
    await openWorkspace.click();
  }
  await expect(page.getByTestId("app-shell")).toBeVisible();
  const nextTheme = info.project.use.colorScheme === "dark" ? "Use light theme" : "Use dark theme";
  const toggle = page.getByTestId("theme-toggle");
  if ((await toggle.getAttribute("aria-label")) !== nextTheme) await toggle.click();
  await expect(toggle).toHaveAttribute("aria-label", nextTheme);
  await expectThemeBackground(page, info.project.use.colorScheme === "dark" ? "dark" : "light");
}

async function expectThemeBackground(page: Page, scheme: "light" | "dark") {
  const expected = themes[scheme].surface;
  await expect
    .poll(() =>
      page.getByTestId("app-shell").evaluate((shell, background) => {
        const probe = document.createElement("div");
        probe.style.backgroundColor = background;
        document.body.append(probe);
        const expectedColor = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return getComputedStyle(shell).backgroundColor === expectedColor;
      }, expected),
    )
    .toBe(true);
}

export async function closePanel(page: Page) {
  await page
    .getByTestId("record-panel")
    .getByRole("button", { name: /^Close / })
    .click();
  await expect(page.getByTestId("record-panel")).toHaveCount(0);
}
