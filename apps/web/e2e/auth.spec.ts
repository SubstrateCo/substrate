import { Mailpit } from "../../server/integration/test-support/mailpit";
import { conversation, post, test, visit } from "./test-support/fixtures";
import { expect, type Page } from "@playwright/test";

async function login(page: Page, email: string, password: string) {
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

test("signup requires email verification before creating and entering a workspace", async ({
  page,
  request,
}) => {
  const id = crypto.randomUUID();
  const email = `onboarding-${id}@example.test`;
  const password = `Onboarding-${id}!`;
  await page.goto("/signup");
  await page.getByLabel("Name", { exact: true }).fill("New teammate");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page).toHaveURL(/\/verify-email/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login|\/verify-email/);
  await page.goto("/login");
  await login(page, email, password);
  await expect(page).toHaveURL(/\/verify-email/);
  const link = await new Mailpit(request).link(
    email,
    "Verify your Startup OS email",
    "/api/auth/verify-email",
  );
  await page.goto(link);
  await expect(page).toHaveURL(/\/login/);
  await login(page, email, password);
  await expect(page.getByRole("heading", { name: "Your workspaces", exact: true })).toBeVisible();
  const name = `Onboarding ${id}`;
  await page.getByLabel("Workspace name", { exact: true }).fill(name);
  await page.getByLabel("Workspace slug", { exact: true }).fill(`onboarding-${id}`);
  await page.getByRole("button", { name: "Create workspace", exact: true }).click();
  await expect(page.getByRole("button", { name: `${name} ▾`, exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: `${name} ▾`, exact: true })).toBeVisible();
});

test("sign-out removes private content, blocks history navigation, and allows a fresh login", async ({
  account,
  client,
}) => {
  const channel = await conversation(account);
  const body = `Private session ${channel.id}`;
  await post(account, "messaging/messages", { conversationId: channel.id, body });
  const signedIn = await client(account);
  await visit(signedIn, channel.id);
  await expect(signedIn.page.getByText(body, { exact: true })).toBeVisible();
  await signedIn.page
    .getByRole("button", { name: `Signed in as ${account.name}`, exact: true })
    .click();
  await signedIn.page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(signedIn.page).toHaveURL(/\/login/);
  await signedIn.page.goBack();
  await expect(signedIn.page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
  await expect(signedIn.page.getByText(body, { exact: true })).toHaveCount(0);
  await login(signedIn.page, account.email, account.password);
  await expect(
    signedIn.page.getByRole("button", { name: `Signed in as ${account.name}`, exact: true }),
  ).toBeVisible();
});

test("password recovery replaces the password and invalidates old sessions", async ({
  account,
  client,
  page,
  request,
}) => {
  const old = await client(account);
  await visit(old);
  await page.goto("/forgot-password");
  await page.getByLabel("Email", { exact: true }).fill(account.email);
  await page.getByRole("button", { name: "Send reset link", exact: true }).click();
  await expect(
    page.getByText("Check your inbox for a password reset link.", { exact: true }),
  ).toBeVisible();
  const link = await new Mailpit(request).link(
    account.email,
    "Reset your Startup OS password",
    "/api/auth/reset-password",
  );
  await page.goto(link);
  const password = `Recovered-${crypto.randomUUID()}!`;
  await page.getByLabel("New password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Save new password", exact: true }).click();
  await expect(
    page.getByText("Your password was changed. You can now sign in.", { exact: true }),
  ).toBeVisible();
  await old.page.goto("/dashboard");
  await expect(old.page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Sign in", exact: true }).click();
  await login(page, account.email, account.password);
  await expect(page.getByRole("alert")).toBeVisible();
  await login(page, account.email, password);
  await expect(
    page.getByRole("button", { name: `Signed in as ${account.name}`, exact: true }),
  ).toBeVisible();
});
