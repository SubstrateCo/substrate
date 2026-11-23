import { Mailpit } from "../../../server/integration/test-support/mailpit";
import { signIn, signUp, verifyEmail } from "../test-support/auth";
import { conversation, post, test, visit } from "../test-support/fixtures";
import { expect } from "@playwright/test";

test("an unverified account cannot open the workspace until its email is verified", async ({
  page,
  request,
}) => {
  const id = crypto.randomUUID();
  const email = `unverified-${id}@example.test`;
  const password = `Unverified-${id}!`;
  await page.goto("/signup");
  await signUp(page, email, password, "New teammate");
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login|\/verify-email/);
  await page.goto("/login");
  await signIn(page, email, password);
  await expect(page).toHaveURL(/\/verify-email/);
  await verifyEmail(page, request, email);
  await page.goto("/login");
  await signIn(page, email, password);
  await expect(page).toHaveURL(/\/onboarding/);
});
test("sign-out removes private content, blocks history navigation, and allows a fresh login", async ({
  actors,
  client,
  freshSession,
}) => {
  const account = await freshSession(actors.partner);
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
  await signIn(signedIn.page, account.email, account.password);
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
  await page.goto("/forgot-password?redirect=%2Fdashboard");
  await page.getByLabel("Email", { exact: true }).fill(account.email);
  await page.getByRole("button", { name: "Send reset link", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Check your inbox", exact: true })).toBeVisible();
  const link = await new Mailpit(request).link(
    account.email,
    "Reset your Substrate password",
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
  await signIn(page, account.email, account.password);
  await expect(page.getByRole("alert")).toBeVisible();
  await signIn(page, account.email, password);
  await expect(
    page.getByRole("button", { name: `Signed in as ${account.name}`, exact: true }),
  ).toBeVisible();
});
