import { test } from "../test-support/fixtures";
import { expect } from "@playwright/test";

for (const prefix of ["/api/v1", "/api/mobile"]) {
  test(`${prefix} anonymous callers cannot list workspace conversations`, async ({ request }) => {
    const response = await request.get(`${prefix}/messaging/conversations`, {
      params: { organizationId: "no-workspace" },
    });
    expect(response.status()).toBe(401);
    expect(await response.json()).toEqual({
      success: false,
      error: {
        code: "UNAUTHENTICATED",
        message: "Sign in to continue.",
        userMessage: "Sign in to continue.",
      },
    });
  });
}
