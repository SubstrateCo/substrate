import { expect, test } from "@playwright/test";

test("workspace load errors have a title and preserve workspace creation", async ({ page }) => {
  await page.goto("/iframe.html?id=scenes-workspaces--load-error&viewMode=story");
  await expect(page.getByRole("heading", { name: "Couldn’t load workspaces" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create workspace", exact: true })).toBeEnabled();
  await expect(page.getByText("You have no workspaces yet.", { exact: false })).toHaveCount(0);
});

test("conversation failures are not shown as an empty sidebar on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/iframe.html?id=scenes-messaging--conversation-list-error&viewMode=story");
  await page.getByRole("button", { name: "Show conversations" }).click();
  const sidebar = page.getByRole("complementary", { name: "Conversations" });
  await expect(sidebar.getByRole("heading", { name: "Couldn’t load conversations" })).toBeVisible();
  await expect(sidebar.getByRole("button", { name: "Try again" })).toBeVisible();
  await expect(sidebar.getByText("No channels yet", { exact: true })).toHaveCount(0);
});

test("table loading reserves space and announces the content being loaded", async ({ page }) => {
  await page.goto("/iframe.html?id=scenes-settings--loading&viewMode=story");
  const status = page.getByRole("status", { name: "Loading invitations…", exact: true });
  await expect(status).toBeVisible();
  expect((await status.boundingBox())!.height).toBeGreaterThan(100);
  await expect(page.getByText("No invitations yet.", { exact: true })).toHaveCount(0);
});

test("workspace retry restores the list without discarding creation fields", async ({ page }) => {
  await page.goto("/iframe.html?id=scenes-feedback--workspace-retry&viewMode=story");
  const name = page.getByRole("textbox", { name: "Workspace name", exact: true });
  await name.fill("My next workspace");
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByRole("button", { name: "Launch Studio", exact: true })).toBeVisible();
  await expect(name).toHaveValue("My next workspace");
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("workspace dropdown recovers in place and keeps management available", async ({ page }) => {
  await page.goto("/iframe.html?id=scenes-feedback--switcher-retry&viewMode=story");
  await page.getByRole("button", { name: "Launch Studio ▾", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Couldn’t load workspaces" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Manage workspaces" })).toBeVisible();
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("menuitem", { name: "Launch Studio (current)" })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("invitation fetch retry restores acceptance", async ({ page }) => {
  await page.goto("/iframe.html?id=scenes-feedback--invitation-retry&viewMode=story");
  await expect(page.getByRole("button", { name: "Accept invitation" })).toHaveCount(0);
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("button", { name: "Accept invitation" })).toBeEnabled();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("invitation action errors preserve the email for another attempt", async ({ page }) => {
  await page.goto("/iframe.html?id=scenes-feedback--invitation-action-error&viewMode=story");
  const email = page.getByRole("textbox", { name: "Email", exact: true });
  await email.fill("new@example.com");
  await page.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByRole("alert")).toContainText("We couldn’t update this invitation.");
  await expect(email).toHaveValue("new@example.com");
  await page.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByRole("status")).toContainText("Invitation email sent.");
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("message failures preserve the draft until a successful retry", async ({ page }) => {
  await page.goto("/iframe.html?id=scenes-feedback--message-action-error&viewMode=story");
  const draft = page.getByRole("textbox", { name: "Message #general" });
  await draft.fill("Keep my draft");
  await draft.press("Enter");
  await expect(page.getByRole("alert")).toContainText("Your draft is still here.");
  await expect(draft).toHaveValue("Keep my draft");
  await draft.press("Enter");
  await expect(page.getByRole("heading", { name: "Message sent" })).toBeVisible();
  await expect(draft).toHaveValue("");
});

test("refresh failures keep loaded messages visible", async ({ page }) => {
  await page.goto("/iframe.html?id=scenes-feedback--refresh-error&viewMode=story");
  await expect(page.getByRole("heading", { name: "Couldn’t refresh messages" })).toBeVisible();
  await expect(page.getByRole("log")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Message #general" })).toBeEnabled();
});

test("table refresh errors retain rows, but access loss hides them", async ({ page }) => {
  await page.goto("/iframe.html?id=components-table--refresh-error&viewMode=story");
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: "person-01@example.com" })).toBeVisible();
  await page.goto("/iframe.html?id=components-table--access-error&viewMode=story");
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: "person-01@example.com" })).toHaveCount(0);
});

for (const theme of ["light", "dark"]) {
  test(`feedback fits a narrow viewport in the ${theme} theme`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 740 });
    for (const story of [
      "load-error",
      "list-loading",
      "invitation-retry",
      "unavailable",
      "page-pending",
    ]) {
      await page.goto(
        `/iframe.html?id=scenes-feedback--${story}&viewMode=story&globals=theme:${theme}`,
      );
      await expect(
        page.getByRole(
          story.includes("loading") || story === "page-pending" || story === "unavailable"
            ? "status"
            : "alert",
        ),
      ).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      for (const retry of await page.getByRole("button", { name: "Try again" }).all()) {
        await expect(retry).toBeInViewport({ ratio: 1 });
      }
    }
  });
}

test("loading placeholders honor reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/iframe.html?id=scenes-feedback--list-loading&viewMode=story");
  const status = page.getByRole("status", { name: "Loading invitations…" });
  await expect(status).toBeVisible();
  const durations = await status
    .locator('[data-slot="skeleton"]')
    .evaluateAll((nodes) =>
      nodes.map((node) => parseFloat(getComputedStyle(node).animationDuration)),
    );
  expect(durations.length).toBeGreaterThan(0);
  expect(durations.every((duration) => duration <= 0.01)).toBe(true);
});
