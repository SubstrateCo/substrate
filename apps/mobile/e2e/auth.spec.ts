import { captureScreenshot } from "./test-support/capture";
import { apiURL, previewURL, test as base } from "./test-support/fixtures";
import { emailLink } from "./test-support/mailpit";
import { expect, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";

interface ExistingAccount {
  email: string;
  password: string;
}

async function createExistingAccount(request: APIRequestContext): Promise<ExistingAccount> {
  const id = randomUUID();
  const account = {
    email: `mobile-auth-e2e-${id}@example.test`,
    password: `Mobile-e2e-${id}!`,
  };
  const response = await request.post(`${apiURL}/api/auth/sign-up/email`, {
    headers: { origin: previewURL },
    data: { name: "Synthetic mobile reviewer", ...account, callbackURL: `${previewURL}/login` },
  });
  expect(response.ok(), "The test API provisions an account created outside mobile").toBe(true);
  return account;
}

async function verifyExistingAccount(request: APIRequestContext, email: string) {
  const link = await emailLink(
    request,
    email,
    "Verify your Substrate email",
    "/api/auth/verify-email",
  );
  const url = new URL(link);
  const response = await request.get(`${apiURL}${url.pathname}${url.search}`, { maxRedirects: 0 });
  expect(response.status()).toBeGreaterThanOrEqual(200);
  expect(response.status()).toBeLessThan(400);
}

const test = base.extend<{ existingAccount: ExistingAccount }>({
  existingAccount: async ({ request }, use) => {
    await use(await createExistingAccount(request));
  },
});

test("Expo web preview: existing-account sign-in and invalid credentials", async ({
  page,
  request,
  existingAccount,
}, info) => {
  await verifyExistingAccount(request, existingAccount.email);
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
  await captureScreenshot(page, info, "auth-sign-in");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("Enter a valid email address.", { exact: true })).toBeVisible();
  await captureScreenshot(page, info, "auth-validation");
  await page.getByLabel("Email", { exact: true }).fill(existingAccount.email);
  await page.getByLabel("Password", { exact: true }).fill("Incorrect-mobile-password!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Invalid email or password");
  await captureScreenshot(page, info, "auth-invalid-credentials");
  await page.getByLabel("Password", { exact: true }).fill(existingAccount.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Choose your workspace", exact: true }),
  ).toBeVisible();
  await captureScreenshot(page, info, "auth-existing-account-signed-in");
});

test("Expo web preview: existing-account verification resend and password recovery", async ({
  page,
  request,
  existingAccount,
}, info) => {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(existingAccount.email);
  await page.getByLabel("Password", { exact: true }).fill(existingAccount.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Resend verification email", exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/verify-email(?:\?|$)/);
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue(existingAccount.email);
  await captureScreenshot(page, info, "auth-verify-email");
  await page.getByRole("button", { name: "Resend verification email", exact: true }).click();
  await expect(
    page.getByText("Verification email sent. Open the link in your inbox to continue.", {
      exact: true,
    }),
  ).toBeVisible();
  await captureScreenshot(page, info, "auth-verification-sent");
  await verifyExistingAccount(request, existingAccount.email);
  await page.getByRole("button", { name: "Back to sign in", exact: true }).click();
  await page.getByRole("button", { name: "Forgot password?", exact: true }).click();
  await expect(page.getByRole("button", { name: "Send reset link", exact: true })).toBeVisible();
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue(existingAccount.email);
  await captureScreenshot(page, info, "auth-forgot-password");
  await page.getByRole("button", { name: "Send reset link", exact: true }).click();
  await expect(
    page.getByText("If an account exists for this address, a reset link is on its way.", {
      exact: true,
    }),
  ).toBeVisible();
  await captureScreenshot(page, info, "auth-recovery-sent");
  const resetLink = await emailLink(
    request,
    existingAccount.email,
    "Reset your Substrate password",
    "/api/auth/reset-password/",
  );
  const resetURL = new URL(resetLink);
  const redirect = await request.get(`${apiURL}${resetURL.pathname}${resetURL.search}`, {
    maxRedirects: 0,
  });
  expect(redirect.status()).toBeGreaterThanOrEqual(300);
  expect(redirect.status()).toBeLessThan(400);
  const destination = redirect.headers().location;
  if (!destination) throw new Error("The real password-reset link did not redirect.");
  expect(new URL(destination).origin).toBe(new URL(page.url()).origin);
  await page.goto(destination);
  await expect(page.getByLabel("New password", { exact: true })).toBeVisible();
  await captureScreenshot(page, info, "auth-reset-password");
  const newPassword = `Reset-mobile-${randomUUID()}!`;
  await page.getByLabel("New password", { exact: true }).fill(newPassword);
  await page.getByRole("button", { name: "Reset password", exact: true }).click();
  await expect(
    page.getByText("Your password has been reset. Sign in with your new password.", {
      exact: true,
    }),
  ).toBeVisible();
  await captureScreenshot(page, info, "auth-password-reset-complete");
  await page.getByRole("button", { name: "Back to sign in", exact: true }).click();
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue(existingAccount.email);
  await page.getByLabel("Password", { exact: true }).fill(newPassword);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Choose your workspace", exact: true }),
  ).toBeVisible();
  await captureScreenshot(page, info, "auth-recovered-account-signed-in");
});
