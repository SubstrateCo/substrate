import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createVerifiedAccount } from "./auth";
import { Mailpit } from "./mailpit";

test("appearance persists across reload and navigation and follows the system when selected", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/login");
  await expect(page.getByText("Welcome back", { exact: true })).toBeVisible();
  const background = () =>
    page.locator("body").evaluate((node) => getComputedStyle(node).backgroundColor);
  const light = await background();
  const switcher = page.getByRole("button", { name: "Color theme", exact: true });
  await switcher.click();
  await page.getByRole("menuitemradio", { name: "Dark", exact: true }).click();
  await expect.poll(background).not.toBe(light);
  const dark = await background();
  await page.reload();
  await expect.poll(background).toBe(dark);
  await page.goto("/signup");
  await expect.poll(background).toBe(dark);
  await switcher.click();
  await expect(page.getByRole("menuitemradio", { name: "Dark", exact: true })).toBeChecked();
  await page.getByRole("menuitemradio", { name: "System", exact: true }).click();
  await expect.poll(background).toBe(light);
  await page.emulateMedia({ colorScheme: "dark" });
  await expect.poll(background).toBe(dark);
});

test("signed-out users can open password recovery directly", async ({ page }) => {
  await page.goto("/forgot-password?redirect=%2Faccept-invitation%2Finvite-123");
  await expect(page.getByText("Reset your password", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/forgot-password\?/);

  await page.goto(
    "/reset-password?token=test-reset-token&redirect=%2Faccept-invitation%2Finvite-123",
  );
  await expect(page.getByText("Choose a new password", { exact: true })).toBeVisible();
  await expect(page.getByLabel("New password", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Confirm password", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/reset-password\?/);
  await page.getByRole("link", { name: "Request a new reset link", exact: true }).click();
  await expect(page).toHaveURL(/\/forgot-password\?redirect=%2Faccept-invitation%2Finvite-123/);
});

test("signed-out users can open email verification without a redirect loop", async ({ page }) => {
  await page.goto("/verify-email?email=team%40example.com&redirect=%2Forganizations");
  await expect(page.getByText("Verify your email", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/verify-email\?/);
});

test("unauthorized deep links retain their full destination", async ({ page }) => {
  const destination = "/accept-invitation/invite-123?source=email";
  await page.goto(destination);
  await expect(page.getByText("Welcome back", { exact: true })).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/login");
  expect(new URL(page.url()).searchParams.get("redirect")).toBe(destination);
});

test("cookie-only sessions skip login and signup and survive dashboard reload", async ({
  page,
  request,
  browser,
}) => {
  const suffix = randomUUID();
  const account = {
    name: `Routing ${suffix}`,
    email: `routing-${suffix}@example.test`,
    password: `Routing-${randomUUID()}!`,
  };
  await createVerifiedAccount(page, new Mailpit(request), account);
  for (const path of ["/login", "/signup"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/organizations$/);
  }

  const created = await page.request.post("/api/auth/organization/create", {
    headers: { origin: new URL(page.url()).origin },
    data: { name: `Routing ${suffix}`, slug: `routing-${suffix}` },
  });
  expect(created.ok(), await created.text()).toBe(true);
  const organization: { id: string } = await created.json();
  const activated = await page.request.post("/api/auth/organization/set-active", {
    headers: { origin: new URL(page.url()).origin },
    data: { organizationId: organization.id },
  });
  expect(activated.ok()).toBe(true);

  const state = await page.context().storageState();
  const restored = await browser.newContext({
    baseURL: new URL(page.url()).origin,
    storageState: { cookies: state.cookies, origins: [] },
  });
  try {
    const restoredPage = await restored.newPage();
    for (const path of ["/login", "/signup"]) {
      await restoredPage.goto(path);
      await expect(restoredPage).toHaveURL(/\/dashboard$/);
      await expect(
        restoredPage.getByRole("button", { name: "Sign out", exact: true }),
      ).toBeVisible();
    }
    await restoredPage.reload();
    await expect(restoredPage).toHaveURL(/\/dashboard$/);
    await expect(restoredPage.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();

    await restoredPage.goto("/login?redirect=%2Forganizations");
    await expect(restoredPage).toHaveURL(/\/organizations$/);
    await restoredPage.goto("/forgot-password");
    await expect(restoredPage.getByText("Reset your password", { exact: true })).toBeVisible();
    await restoredPage.goto("/reset-password?token=test-reset-token");
    await expect(restoredPage.getByLabel("New password", { exact: true })).toBeVisible();
  } finally {
    await restored.close();
  }
});
