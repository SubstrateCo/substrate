import { callMessaging } from "../test-support/api";
import {
  login,
  provisionVerifiedAccount,
  signup,
  signout,
  verifyEmail,
  type TestAccount,
} from "../test-support/auth";
import { Mailpit, openEmailLink } from "../test-support/mailpit";
import {
  createWorkspace,
  expectScopedMembershipAfter,
  expectWorkspace,
  provisionWorkspace,
  switchWorkspace,
} from "../test-support/organizations";
import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";

test("workspace routes redirect anonymous visitors to sign in", async ({ page }) => {
  for (const path of [
    "/dashboard",
    "/organizations",
    "/settings/user",
    "/settings/user/invitations",
    "/settings/organization",
  ]) {
    await page.goto(path);
    await expect(page.getByText("Welcome back", { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/login\?/);
    const destination = new URL(page.url()).searchParams.get("redirect");
    expect(destination, "Sign in preserves the requested workspace route").toBe(path);
  }
  const result = await callMessaging(page, "listConversations");
  expect(result.error, "Anonymous visitors cannot list conversations").toBe("Sign in to continue.");
});

for (const workflow of ["onboarding", "recovery"] as const) {
  test(`verified accounts support team ${workflow}`, async ({ page, request, browser }) => {
    const suffix = randomUUID();
    const owner: TestAccount = {
      name: `Owner ${suffix}`,
      email: `owner-${suffix}@example.test`,
      password: `Initial-${randomUUID()}!`,
    };
    const member: TestAccount = {
      name: `Member ${suffix}`,
      email: `member-${suffix}@example.test`,
      password: `Initial-${randomUUID()}!`,
    };
    const mailpit = new Mailpit(request);
    const firstWorkspace = `Team Alpha ${suffix}`;
    const secondWorkspace = `Team Beta ${suffix}`;
    let invitationLink = "";
    let canceledInvitationLink = "";
    let recoveryInvitationId = "";
    const deniedEmail = `denied-${suffix}@example.test`;

    if (workflow === "recovery") {
      await provisionVerifiedAccount(page, mailpit, owner);
      await provisionWorkspace(page, firstWorkspace, `alpha-${suffix}`);
      const context = await browser.newContext();
      try {
        const memberPage = await context.newPage();
        await provisionVerifiedAccount(memberPage, mailpit, member);
        const invited = await page.request.post("/api/auth/organization/invite-member", {
          headers: { origin: new URL(page.url()).origin },
          data: { email: member.email, role: "member" },
        });
        expect(invited.ok(), "The recovery fixture invites a real member").toBe(true);
        const invitation: { id: string } = await invited.json();
        recoveryInvitationId = invitation.id;
      } finally {
        await context.close();
      }
    }

    if (workflow === "onboarding") {
      await test.step("open signup requires email verification before workspace access", async () => {
        await page.goto("/signup");
        await signup(page, owner);
        await page.goto("/dashboard");
        await expect(page.getByText("Welcome back", { exact: true })).toBeVisible();
        await login(page, owner);
        await expect(page.getByText("Verify your email", { exact: true })).toBeVisible();
        const previousIds = await mailpit.messageIds(owner.email);
        await page.getByRole("button", { name: "Resend verification email", exact: true }).click();
        await expect(
          page.getByText("Verification email requested. Check your inbox and spam folder.", {
            exact: true,
          }),
        ).toBeVisible();
        await verifyEmail(page, mailpit, owner.email, previousIds);
        await login(page, owner);
        await expect(
          page.getByRole("heading", { name: "Your workspaces", exact: true }),
        ).toBeVisible();
        await expect(
          page.getByRole("status").getByRole("heading", { name: "No workspaces yet", exact: true }),
        ).toBeVisible();
        await expect(page.getByRole("status")).toContainText(
          "Create one below, or open an invitation link from your email.",
        );
      });

      await test.step("an owner creates a workspace and invites a member from the UI", async () => {
        await createWorkspace(page, firstWorkspace, `alpha-${suffix}`);
        await expectWorkspace(page, firstWorkspace, owner.name, "owner");
        await page.getByRole("button", { name: /^Signed in as / }).click();
        await page.getByRole("button", { name: "Organization settings", exact: true }).click();
        await page.getByLabel("Email", { exact: true }).fill(member.email);
        await expect(page.getByRole("combobox", { name: "Role", exact: true })).toContainText(
          "Member",
        );
        await page.getByRole("button", { name: "Send invitation", exact: true }).click();
        await expect(page.getByText("Invitation email sent.", { exact: true })).toBeVisible();
        await expect(
          page.getByRole("row").filter({ hasText: member.email }).filter({ hasText: "pending" }),
        ).toContainText("pending");
        invitationLink = await mailpit.link(
          member.email,
          `Join ${firstWorkspace} on Startup OS`,
          "/accept-invitation/",
        );
      });

      await test.step("an owner can resend and cancel an invitation before issuing a replacement", async () => {
        const invitation = page.getByRole("row").filter({ hasText: member.email });
        const previousIds = await mailpit.messageIds(member.email);
        await invitation.getByRole("button", { name: "Resend", exact: true }).click();
        canceledInvitationLink = await mailpit.link(
          member.email,
          `Join ${firstWorkspace} on Startup OS`,
          "/accept-invitation/",
          previousIds,
        );
        await invitation.getByRole("button", { name: "Cancel", exact: true }).click();
        await expect(invitation).toContainText("canceled");
        await expect(invitation.getByRole("button", { name: "Resend", exact: true })).toHaveCount(
          0,
        );
        const canceledIds = await mailpit.messageIds(member.email);
        await page.getByRole("button", { name: "Send invitation", exact: true }).click();
        await expect(
          page.getByRole("row").filter({ hasText: member.email }).filter({ hasText: "pending" }),
        ).toBeVisible();
        invitationLink = await mailpit.link(
          member.email,
          `Join ${firstWorkspace} on Startup OS`,
          "/accept-invitation/",
          canceledIds,
        );
        expect(
          invitationLink === canceledInvitationLink,
          "A replacement invitation has a new link",
        ).toBe(false);
      });

      const second = await page.request.post("/api/auth/organization/create", {
        headers: { origin: new URL(page.url()).origin },
        data: {
          name: secondWorkspace,
          slug: `beta-${suffix}`,
          keepCurrentActiveOrganization: true,
        },
      });
      expect(second.ok(), "The owner has a second private workspace").toBe(true);
      await signout(page);
    }

    if (workflow === "recovery") {
      await test.step("multiple workspaces can be switched and the last selection survives signout", async () => {
        await page.getByRole("button", { name: `${firstWorkspace} ▾`, exact: true }).click();
        await page.getByRole("menuitem", { name: "Manage workspaces", exact: true }).click();
        await createWorkspace(page, secondWorkspace, `beta-${suffix}`);
        await expectWorkspace(page, secondWorkspace, owner.name, "owner");
        await page.getByRole("button", { name: /^Signed in as / }).click();
        await page.getByRole("button", { name: "Organization settings", exact: true }).click();
        await expect(
          page.getByRole("heading", { name: "No invitations yet.", exact: true }),
        ).toBeVisible();
        await expect(page.getByRole("row").filter({ hasText: member.email })).toHaveCount(0);
        await switchWorkspace(page, secondWorkspace, firstWorkspace);
        await expectWorkspace(page, firstWorkspace, owner.name, "owner");
        await page.getByRole("button", { name: /^Signed in as / }).click();
        await page.getByRole("button", { name: "Organization settings", exact: true }).click();
        await expect(
          page.getByRole("row").filter({ hasText: member.email }).filter({ hasText: "pending" }),
        ).toContainText("pending");
        await signout(page);
        await login(page, owner);
        await expectWorkspace(page, firstWorkspace, owner.name, "owner");
      });
    }

    if (workflow === "onboarding") {
      await test.step("an invited new account signs up, verifies email, and accepts the invitation", async () => {
        await openEmailLink(page, invitationLink);
        await expect(page.getByText("Welcome back", { exact: true })).toBeVisible();
        await page.getByRole("link", { name: "Create account", exact: true }).click();
        await signup(page, member);
        await verifyEmail(page, mailpit, member.email);
        await login(page, member);
        await expect(page.getByText("Join your team", { exact: true })).toBeVisible();
        await openEmailLink(page, canceledInvitationLink);
        await expect(
          page
            .getByRole("status")
            .getByRole("heading", { name: "Invitation unavailable", exact: true }),
        ).toBeVisible();
        await expect(
          page.getByRole("button", { name: "Accept invitation", exact: true }),
        ).toHaveCount(0);
        await openEmailLink(page, invitationLink);
        await expect(
          page.getByText(`Invited email: ${member.email}`, { exact: true }),
        ).toBeVisible();
        await expectScopedMembershipAfter(page, () =>
          page.getByRole("button", { name: "Accept invitation", exact: true }).click(),
        );
        await expectWorkspace(page, firstWorkspace, member.name, "member");
      });

      await test.step("a nonowner cannot see invitation controls or another user's private workspace", async () => {
        await expect(
          page.getByRole("button", { name: "Send invitation", exact: true }),
        ).toHaveCount(0);
        await expect(page.getByLabel("Role", { exact: true })).toHaveCount(0);
        await expect(page.getByText("Invite your team", { exact: true })).toHaveCount(0);
        await page.getByRole("button", { name: `${firstWorkspace} ▾`, exact: true }).click();
        await expect(
          page.getByRole("menuitem", { name: `${firstWorkspace} (current)`, exact: true }),
        ).toBeVisible();
        await expect(
          page.getByRole("menuitem", { name: secondWorkspace, exact: true }),
        ).toHaveCount(0);
        await page.keyboard.press("Escape");
      });

      await test.step("the server enforces the application's owner-only invitation policy", async () => {
        const organizationResponse = await page.request.get(
          "/api/auth/organization/get-full-organization",
        );
        if (!organizationResponse.ok())
          throw new Error("Could not read the member's active workspace.");
        const organization: { id: string } = await organizationResponse.json();
        const denied = await page.request.post("/api/auth/organization/invite-member", {
          headers: { Origin: new URL(page.url()).origin },
          data: { organizationId: organization.id, email: deniedEmail, role: "member" },
        });
        expect(denied.status(), "A member cannot invite another user through the server API").toBe(
          403,
        );
      });
    }

    if (workflow === "recovery") {
      await test.step("forgot password sends a real reset email and the new password grants access", async () => {
        const context = await browser.newContext();
        try {
          const origin = new URL(page.url()).origin;
          const signedIn = await context.request.post("/api/auth/sign-in/email", {
            headers: { origin },
            data: { email: member.email, password: member.password },
          });
          expect(signedIn.ok(), "The recovery fixture member can sign in").toBe(true);
          const accepted = await context.request.post("/api/auth/organization/accept-invitation", {
            headers: { origin },
            data: { invitationId: recoveryInvitationId },
          });
          expect(accepted.ok(), "The recovery fixture member accepts the invitation").toBe(true);
        } finally {
          await context.close();
        }
        await signout(page);
        await page.getByRole("link", { name: "Forgot password?", exact: true }).click();
        await page.getByLabel("Email", { exact: true }).fill(owner.email);
        await page.getByRole("button", { name: "Send reset link", exact: true }).click();
        await expect(
          page.getByText("Check your inbox for a password reset link.", { exact: true }),
        ).toBeVisible();
        const link = await mailpit.link(
          owner.email,
          "Reset your Startup OS password",
          "/api/auth/reset-password/",
        );
        await openEmailLink(page, link);
        await expect(page.getByText("Choose a new password", { exact: true })).toBeVisible();
        const password = `Recovered-${randomUUID()}!`;
        await page.getByLabel("New password", { exact: true }).fill(password);
        await page.getByLabel("Confirm password", { exact: true }).fill(password);
        await page.getByRole("button", { name: "Save new password", exact: true }).click();
        await expect(
          page.getByText("Your password was changed. You can now sign in.", { exact: true }),
        ).toBeVisible();
        await page.getByRole("link", { name: "Sign in", exact: true }).click();
        await login(page, owner);
        await expect(page.getByRole("alert")).toContainText(/invalid|incorrect/i);
        owner.password = password;
        await login(page, owner);
        await expectWorkspace(page, firstWorkspace, owner.name, "owner");
        await page.getByRole("button", { name: /^Signed in as / }).click();
        await page.getByRole("button", { name: "Organization settings", exact: true }).click();
        await expect(
          page.getByRole("row").filter({ hasText: member.email }).filter({ hasText: "accepted" }),
        ).toContainText("accepted");
        await expect(page.getByRole("row").filter({ hasText: deniedEmail })).toHaveCount(0);
        await signout(page);
      });
    }
  });
}
