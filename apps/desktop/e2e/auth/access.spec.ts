import { test } from "../test-support/fixture.js";
import { expect } from "@playwright/test";

test("signed-out native routes preserve the complete sign-in destination", async ({ desktop }) => {
  for (const path of [
    "/dashboard",
    "/organizations",
    "/settings/user",
    "/settings/user/invitations",
    "/settings/organization",
    "/tasks?projectId=00000000-0000-4000-8000-000000000001",
  ]) {
    await desktop.openPath(path);
    await expect(
      desktop.page.getByRole("button", { name: "Sign in with browser", exact: true }),
    ).toBeVisible();
    expect(new URL(desktop.page.url()).searchParams.get("redirect")).toBe(path);
  }
});
