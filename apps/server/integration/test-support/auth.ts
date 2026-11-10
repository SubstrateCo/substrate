import { appOrigin } from "./environment.js";
import { Mailpit } from "./mailpit.js";
import { expect, type APIRequestContext } from "@playwright/test";

export interface TestAccount {
  name: string;
  email: string;
  password: string;
}

export async function provisionVerifiedAccount(
  page: { request: APIRequestContext },
  mailpit: Mailpit,
  account: TestAccount,
) {
  const origin = appOrigin;
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
