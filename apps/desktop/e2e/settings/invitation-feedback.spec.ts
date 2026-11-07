import { test } from "../test-support/fixture.js";
import { fitsWindow, resize } from "../test-support/layout.js";
import { expect } from "@playwright/test";

declare global {
  interface Window {
    invitationFailure?: { release: () => void; recover: () => void; restore: () => void };
  }
}

test("personal invitations show loading, recover from errors and disable expired invitations", async ({
  desktop,
}) => {
  await desktop.provision();
  const { page } = desktop;
  await page.addInitScript(() => {
    const original = window.fetch;
    let failed = true;
    let active = true;
    let release: () => void = () => {};
    const loading = new Promise<void>((resolve) => {
      release = resolve;
    });
    window.fetch = Object.assign(async (...args: Parameters<typeof fetch>) => {
      const input = args[0];
      const url = new URL(input instanceof Request ? input.url : String(input), location.href);
      if (active && url.pathname === "/api/auth/organization/list-user-invitations") {
        await loading;
        return Response.json(
          failed
            ? { message: "Could not load your invitations." }
            : [
                {
                  id: "available",
                  organizationName: "Available team",
                  role: "member",
                  status: "pending",
                  expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
                },
                {
                  id: "expired",
                  organizationName: "Expired team",
                  role: "admin",
                  status: "pending",
                  expiresAt: new Date(Date.now() - 86_400_000).toISOString(),
                },
              ],
          { status: failed ? 400 : 200 },
        );
      }
      return original(...args);
    }, original);
    window.invitationFailure = {
      release: () => release(),
      recover: () => {
        failed = false;
      },
      restore: () => {
        active = false;
        release();
        window.fetch = original;
        delete window.invitationFailure;
      },
    };
  });
  await desktop.openPath("/settings/user/invitations");
  const invitations = await page.evaluateHandle(() => {
    if (!window.invitationFailure)
      throw new Error("The native invitation response gate was not installed.");
    return window.invitationFailure;
  });
  try {
    await expect(
      page.getByRole("status", { name: "Loading your invitations…", exact: true }),
    ).toBeVisible();
    await invitations.evaluate((control) => control.release());
    await expect(
      page.getByRole("heading", { name: "Couldn’t load your invitations" }),
    ).toBeVisible();
    await invitations.evaluate((control) => control.recover());
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    const available = page.getByRole("row").filter({ hasText: "Available team" });
    const expired = page.getByRole("row").filter({ hasText: "Expired team" });
    await expect(
      available.getByRole("link", { name: "Review invitation", exact: true }),
    ).toBeVisible();
    await expect(expired).toContainText("expired");
    await expect(expired.getByRole("link")).toHaveCount(0);
    await resize(desktop, 320, 568);
    const cards = page.getByRole("list", { name: "Your invitations", exact: true });
    await fitsWindow(cards.getByRole("link", { name: "Review invitation", exact: true }));
    const expiredCard = cards.getByRole("listitem").filter({ hasText: "Expired team" });
    await expect(expiredCard).toContainText("expired");
    await expect(expiredCard.getByRole("link")).toHaveCount(0);
  } finally {
    await invitations.evaluate((control) => control.restore());
    await invitations.dispose();
  }
});
