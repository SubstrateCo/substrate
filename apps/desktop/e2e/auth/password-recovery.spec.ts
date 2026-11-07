import { requestBrowserSignIn } from "../test-support/auth.js";
import { test } from "../test-support/fixture.js";
import { expect } from "@playwright/test";
import { randomUUID } from "node:crypto";

test("desktop password recovery returns to browser sign-in and the existing workspace", async ({
  desktop,
}) => {
  await desktop.provision();
  const { page, browser, owner, workspace } = desktop;
  await desktop.signout();
  await browser.context().clearCookies();
  await requestBrowserSignIn(desktop.app, page, browser);
  await browser.getByRole("link", { name: "Forgot password?", exact: true }).click();
  await browser.getByLabel("Email", { exact: true }).fill(owner.email);
  await browser.getByRole("button", { name: "Send reset link", exact: true }).click();
  await expect(
    browser.getByText("Check your inbox for a password reset link.", { exact: true }),
  ).toBeVisible();
  await browser.goto(
    await desktop.mailpit.link(
      owner.email,
      "Reset your Startup OS password",
      "/api/auth/reset-password",
    ),
  );
  await expect(browser.getByText("Choose a new password", { exact: true })).toBeVisible();
  owner.password = `Recovered-${randomUUID()}!`;
  await browser.getByLabel("New password", { exact: true }).fill(owner.password);
  await browser.getByLabel("Confirm password", { exact: true }).fill(owner.password);
  await browser.getByRole("button", { name: "Save new password", exact: true }).click();
  await expect(
    browser.getByText("Your password was changed. You can now sign in.", { exact: true }),
  ).toBeVisible();
  await browser.getByRole("link", { name: "Sign in", exact: true }).click();
  await browser.getByLabel("Email", { exact: true }).fill(owner.email);
  await browser.getByLabel("Password", { exact: true }).fill("Old-invalid-password!");
  await browser.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(browser.getByRole("alert")).toContainText(/invalid|incorrect/i);
  await desktop.login(owner);
  await expect(page.getByRole("button", { name: `${workspace} ▾`, exact: true })).toBeVisible();
});
