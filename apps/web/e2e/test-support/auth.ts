import { Mailpit } from "../../../server/integration/test-support/mailpit";
import { expect, type APIRequestContext, type Page } from "@playwright/test";

/** Fills the open signup form. Signup always continues to email verification. */
export async function signUp(page: Page, email: string, password: string, name = "New customer") {
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page).toHaveURL(/\/verify-email/);
}

/** Fills the open sign-in form. */
export async function signIn(page: Page, email: string, password: string) {
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

/** Opens the verification link from the email the server sent. */
export async function verifyEmail(page: Page, request: APIRequestContext, email: string) {
  await page.goto(
    await new Mailpit(request).link(
      email,
      "Verify your Substrate email",
      "/api/auth/verify-email",
    ),
  );
}
