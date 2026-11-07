import { expect, test } from "@playwright/test";

test("anonymous callers cannot list workspace conversations", async ({ request }) => {
  const response = await request.get("/api/v1/messaging/conversations", {
    params: { organizationId: "no-workspace" },
  });
  expect(response.status()).toBe(401);
  expect(await response.json()).toEqual({
    success: false,
    error: { code: "UNAUTHENTICATED", message: "Sign in to continue." },
  });
});
