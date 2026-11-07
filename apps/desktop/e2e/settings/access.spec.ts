import { provisionVerifiedAccount } from "../../../web/e2e/test-support/auth.js";
import { test } from "../test-support/fixture.js";
import { expect } from "@playwright/test";

test("personal invitations work without a workspace and organization settings enforce member and admin roles", async ({
  desktop,
  desktopPeer,
}) => {
  await desktop.provision();
  const { page } = desktop;
  await provisionVerifiedAccount(desktopPeer.browser, desktopPeer.mailpit, desktopPeer.owner);
  await desktopPeer.authorize();
  const peer = desktopPeer.page;
  await desktopPeer.openPath("/settings/user/invitations");
  await expect(
    peer.getByText("You have no pending invitations.", { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  const organizationResponse = await desktop.browser.request.get(
    "/api/auth/organization/get-full-organization",
  );
  expect(organizationResponse.ok()).toBe(true);
  const organization: { id: string } = await organizationResponse.json();
  let invitationId = "";
  for (const email of [desktopPeer.owner.email, `unrelated-${desktop.suffix}@example.test`]) {
    const response = await desktop.browser.request.post("/api/auth/organization/invite-member", {
      headers: { origin: desktop.rendererOrigin },
      data: { organizationId: organization.id, email, role: "member" },
    });
    expect(response.ok()).toBe(true);
    if (email === desktopPeer.owner.email) invitationId = (await response.json()).id;
  }
  await peer.reload();
  const invitations = peer.getByRole("table", { name: "Your invitations", exact: true });
  const review = invitations.getByRole("link", { name: "Review invitation", exact: true });
  await expect(review).toHaveCount(1);
  await expect(review).toHaveAttribute("href", `/accept-invitation/${invitationId}`);
  await desktopPeer.openPath("/settings/user");
  const theme = peer.getByRole("switch", { name: "Dark mode", exact: true });
  await theme.setChecked(true);
  await peer.reload();
  await expect(theme).toBeChecked();
  await desktopPeer.openPath("/settings/user/invitations");
  await review.click();
  await peer.getByRole("button", { name: "Accept invitation", exact: true }).click();
  await expect(
    peer.getByRole("button", { name: `${desktop.workspace} ▾`, exact: true }),
  ).toBeVisible();
  await desktopPeer.openPath("/settings/organization");
  await expect(
    peer.getByRole("heading", { name: "Organization settings", exact: true }),
  ).toHaveCount(0);
  const details = await desktop.browser.request.get("/api/auth/organization/get-full-organization");
  const members: { members: { id: string; user: { email: string } }[] } = await details.json();
  const memberId = members.members.find(
    (member) => member.user.email === desktopPeer.owner.email,
  )!.id;
  for (const role of ["member", "admin"] as const) {
    if (role === "admin") {
      const promoted = await desktop.browser.request.post(
        "/api/auth/organization/update-member-role",
        {
          headers: { origin: desktop.rendererOrigin },
          data: { organizationId: organization.id, memberId, role },
        },
      );
      expect(promoted.ok()).toBe(true);
      await desktopPeer.openPath("/settings/organization");
      await expect(
        peer.getByRole("heading", { name: "Organization settings", exact: true }),
      ).toBeVisible();
      await peer.getByRole("tab", { name: "Invitations", exact: true }).click();
      await expect(
        peer.getByText("Only organization owners can send and manage invitations.", {
          exact: true,
        }),
      ).toBeVisible();
    }
    await expect(peer.getByRole("button", { name: "Send invitation", exact: true })).toHaveCount(0);
    const denied = await desktopPeer.browser.request.post("/api/auth/organization/invite-member", {
      headers: { origin: desktopPeer.rendererOrigin },
      data: {
        organizationId: organization.id,
        email: `denied-${role}-${desktop.suffix}@example.test`,
        role: "member",
      },
    });
    expect(denied.status()).toBe(403);
  }
  await desktopPeer.openPath("/settings/user/invitations");
  await expect(peer.getByRole("link", { name: "Review invitation", exact: true })).toHaveCount(0);
  await desktop.openPath("/settings/user/invitations");
  await expect(page.getByRole("link", { name: "Review invitation", exact: true })).toHaveCount(0);
});
