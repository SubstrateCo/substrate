import { expect, type Page } from "@playwright/test";
import { Mailpit, openEmailLink } from "./mailpit";

export interface TestAccount {
  name: string;
  email: string;
  password: string;
}

export async function signup(page: Page, account: TestAccount) {
  await expect(page.getByText("Create your account", { exact: true })).toBeVisible();
  await page.getByLabel("Name", { exact: true }).fill(account.name);
  await page.getByLabel("Email", { exact: true }).fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.getByText("Verify your email", { exact: true })).toBeVisible();
}

export async function verifyEmail(
  page: Page,
  mailpit: Mailpit,
  email: string,
  previousIds: readonly string[] = [],
) {
  const link = await mailpit.link(
    email,
    "Verify your Startup OS email",
    "/api/auth/verify-email",
    previousIds,
  );
  await openEmailLink(page, link);
  await expect(page.getByText("Welcome back", { exact: true })).toBeVisible();
}

export async function login(page: Page, account: TestAccount) {
  await expect(page.getByText("Welcome back", { exact: true })).toBeVisible();
  await page.getByLabel("Email", { exact: true }).fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

export async function createVerifiedAccount(page: Page, mailpit: Mailpit, account: TestAccount) {
  await page.goto("/signup");
  await signup(page, account);
  await verifyEmail(page, mailpit, account.email);
  await login(page, account);
  await expect(page.getByRole("heading", { name: "Your workspaces", exact: true })).toBeVisible();
}

export async function signout(page: Page) {
  const user = page.getByRole("button", { name: /^Signed in as / });
  if (await user.isVisible()) await user.click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByText("Welcome back", { exact: true })).toBeVisible();
}
