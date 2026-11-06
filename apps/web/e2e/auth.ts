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

export async function provisionVerifiedAccount(page: Page, mailpit: Mailpit, account: TestAccount) {
  const origin = new URL(process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000").origin;
  const created = await page.request.post("/api/auth/sign-up/email", {
    headers: { origin },
    data: { ...account, callbackURL: "/login" },
  });
  expect(created.ok(), "The test account can sign up").toBe(true);
  const link = await mailpit.link(
    account.email,
    "Verify your Startup OS email",
    "/api/auth/verify-email",
  );
  const verified = await page.request.get(link);
  expect(verified.ok(), "The test account verifies its email").toBe(true);
  const signedIn = await page.request.post("/api/auth/sign-in/email", {
    headers: { origin },
    data: { email: account.email, password: account.password },
  });
  expect(signedIn.ok(), "The verified test account can sign in").toBe(true);
}

export async function signout(page: Page) {
  const user = page.getByRole("button", { name: /^Signed in as / });
  await expect(user).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "User actions" })).toBeHidden();
  await user.focus();
  await user.press("Enter");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByText("Welcome back", { exact: true })).toBeVisible();
}
