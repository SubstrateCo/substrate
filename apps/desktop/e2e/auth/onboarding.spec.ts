import { test } from "../test-support/fixture.js";
import { expect } from "@playwright/test";

test("desktop signup creates a workspace and OS navigation preserves the session", async ({
  desktop,
}) => {
  const { page, owner, workspace } = desktop;
  await expect(page).toHaveURL(
    (url) => url.origin === desktop.rendererOrigin && url.pathname === "/signup",
  );
  await desktop.signup(owner);
  await desktop.login(owner);
  await expect(page.getByRole("heading", { name: "Your workspaces", exact: true })).toBeVisible();
  await page.getByLabel("Workspace name", { exact: true }).fill(workspace);
  await page.getByLabel("Workspace slug", { exact: true }).fill(`desktop-${desktop.suffix}`);
  await page.getByRole("button", { name: "Create workspace", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Signed in as / })).toBeVisible();
  const sessionBefore = await page.evaluate(
    async () => (await (await fetch("/api/v1/session")).json()).data.session.id,
  );
  await desktop.openPath("/dashboard");
  await expect(page.getByRole("button", { name: `${workspace} ▾`, exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      async () => (await (await fetch("/api/v1/session")).json()).data.session.id,
    ),
    "OS navigation preserves the main-owned session",
  ).toBe(sessionBefore);
});
