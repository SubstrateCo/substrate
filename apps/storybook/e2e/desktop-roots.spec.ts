import { expect, test, type Locator, type Page } from "@playwright/test";

async function expectContainedDocument(page: Page) {
  const bounds = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    scrollY: window.scrollY,
  }));
  expect(bounds.width, "The desktop root does not scroll horizontally").toBeLessThanOrEqual(
    bounds.viewportWidth,
  );
  expect(
    bounds.height,
    "The desktop root keeps overflow inside its content scroller",
  ).toBeLessThanOrEqual(bounds.viewportHeight);
  expect(bounds.scrollY, "Reaching inner controls does not scroll the document").toBe(0);
}

async function expectReachableInsideRoot(page: Page, control: Locator) {
  await control.scrollIntoViewIfNeeded();
  await expect(control).toBeInViewport({ ratio: 1 });
  await expectContainedDocument(page);
  await control.focus();
  await expect(control).toBeFocused();
}

for (const theme of ["light", "dark"]) {
  for (const viewport of [
    { width: 800, height: 420 },
    { width: 390, height: 700 },
  ]) {
    for (const state of ["sign-up", "sign-up-error"]) {
      test(`${state} has a contained reachable desktop root at ${viewport.width}x${viewport.height} in ${theme}`, async ({
        page,
      }) => {
        await page.setViewportSize(viewport);
        await page.goto(
          `/iframe.html?id=scenes-account-authentication--${state}&viewMode=story&globals=theme:${theme}`,
        );
        await expect(
          page.getByRole("heading", { name: "Create your account", exact: true }),
        ).toBeVisible();
        await expectContainedDocument(page);
        await page.getByLabel("Name", { exact: true }).fill("Taylor Example");
        await page.getByLabel("Email", { exact: true }).fill("taylor@example.com");
        await expectReachableInsideRoot(
          page,
          page.getByRole("button", { name: "Create account", exact: true }),
        );
        if (state === "sign-up-error") {
          await page.getByRole("alert").scrollIntoViewIfNeeded();
          await expect(page.getByRole("alert")).toBeInViewport({ ratio: 1 });
        }
        await expectReachableInsideRoot(
          page,
          page.getByRole("link", { name: "Sign in", exact: true }),
        );
        await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Taylor Example");
        await expect(page.getByLabel("Email", { exact: true })).toHaveValue("taylor@example.com");
      });
    }

    for (const state of ["populated", "loading", "retry"]) {
      test(`workspace selection ${state} has a contained reachable desktop root at ${viewport.width}x${viewport.height} in ${theme}`, async ({
        page,
      }) => {
        await page.setViewportSize(viewport);
        const story =
          state === "retry"
            ? "scenes-system-feedback--workspace-retry"
            : `scenes-workspace-selection--${state}`;
        await page.goto(`/iframe.html?id=${story}&viewMode=story&globals=theme:${theme}`);
        await expect(
          page.getByRole("heading", { name: "Your workspaces", exact: true }),
        ).toBeVisible();
        await expectContainedDocument(page);
        if (state === "retry") {
          const retry = page.getByRole("button", { name: "Try again", exact: true });
          await expectReachableInsideRoot(page, retry);
          await retry.click();
          await expect(
            page.getByRole("button", { name: "Launch Studio", exact: true }),
          ).toBeVisible();
          await expect(page.getByRole("alert")).toHaveCount(0);
          await expectContainedDocument(page);
        }
        await expectReachableInsideRoot(
          page,
          page.getByRole("textbox", { name: "Workspace name", exact: true }),
        );
        await page
          .getByRole("textbox", { name: "Workspace name", exact: true })
          .fill("New workspace");
        await expectReachableInsideRoot(
          page,
          page.getByRole("textbox", { name: "Workspace slug", exact: true }),
        );
        await page
          .getByRole("textbox", { name: "Workspace slug", exact: true })
          .fill("new-workspace");
        await expectReachableInsideRoot(
          page,
          page.getByRole("button", { name: "Create workspace", exact: true }),
        );
        await expect(
          page.getByRole("textbox", { name: "Workspace name", exact: true }),
        ).toHaveValue("New workspace");
        await expect(
          page.getByRole("textbox", { name: "Workspace slug", exact: true }),
        ).toHaveValue("new-workspace");
      });
    }
  }
}
