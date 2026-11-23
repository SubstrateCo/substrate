import { signIn } from "../test-support/auth";
import { conversation, conversationButton, test, visit } from "../test-support/fixtures";
import { expect } from "@playwright/test";

test("guest page links keep the document and preserve the desktop sign-in handoff", async ({
  page,
}) => {
  await page.goto(
    "/login?redirect=%2Fonboarding&client_id=electron&state=navigation-state&code_challenge=navigation-challenge",
  );
  const timeOrigin = await page.evaluate(() => performance.timeOrigin);

  await page.getByRole("link", { name: "Create account", exact: true }).click();
  await expect(page).toHaveURL(/\/signup\?/);
  const signup = new URL(page.url());
  expect(signup.searchParams.get("redirect")).toBe("/onboarding");
  expect(signup.searchParams.get("client_id")).toBe("electron");
  expect(signup.searchParams.get("state")).toBe("navigation-state");
  expect(signup.searchParams.get("code_challenge")).toBe("navigation-challenge");
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(timeOrigin);

  await page.getByRole("link", { name: "Sign in", exact: true }).click();
  await page.getByRole("link", { name: "Forgot password?", exact: true }).click();
  await expect(page).toHaveURL(/\/forgot-password\?/);
  await page.getByRole("link", { name: "Back to sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/login\?/);
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(timeOrigin);
});

test("sign-in opens the authenticated app without replacing the document", async ({
  account,
  page,
}) => {
  await page.goto("/login?redirect=%2Fdashboard");
  const timeOrigin = await page.evaluate(() => performance.timeOrigin);
  await signIn(page, account.email, account.password);
  await expect(
    page.getByRole("button", { name: `Signed in as ${account.name}`, exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(timeOrigin);
});

test("conversation links preserve workspace scope and the document", async ({
  account,
  client,
}) => {
  const first = await conversation(account);
  const second = await conversation(account);
  const user = await client(account);
  await visit(user, first.id);
  const timeOrigin = await user.page.evaluate(() => performance.timeOrigin);
  const link = conversationButton(user.page, second.name);
  await expect(link).toBeVisible();
  const href = await link.getAttribute("href");
  const destination = new URL(href!, user.page.url());
  expect(destination.pathname).toBe("/messages");
  expect(destination.searchParams.get("workspaceId")).toBe(account.organizationId);
  expect(destination.searchParams.get("conversationId")).toBe(second.id);
  await link.click();
  await expect(user.page.getByRole("heading", { name: second.name, exact: true })).toBeVisible();
  expect(await user.page.evaluate(() => performance.timeOrigin)).toBe(timeOrigin);
  await user.page.goBack();
  await expect(user.page.getByRole("heading", { name: first.name, exact: true })).toBeVisible();
});
